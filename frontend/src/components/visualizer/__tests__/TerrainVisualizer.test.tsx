import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TerrainVisualizer } from "../TerrainVisualizer";

// Mock WebGL context since jsdom does not support it
function createMockGLContext() {
  return {
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ""),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn(() => true),
    getProgramInfoLog: vi.fn(() => ""),
    useProgram: vi.fn(),
    deleteShader: vi.fn(),
    createBuffer: vi.fn(() => ({})),
    bindBuffer: vi.fn(),
    bufferData: vi.fn(),
    getAttribLocation: vi.fn(() => 0),
    enableVertexAttribArray: vi.fn(),
    vertexAttribPointer: vi.fn(),
    enable: vi.fn(),
    blendFunc: vi.fn(),
    clearColor: vi.fn(),
    getUniformLocation: vi.fn(() => ({})),
    clear: vi.fn(),
    uniform1f: vi.fn(),
    drawElements: vi.fn(),
    viewport: vi.fn(),
    bufferSubData: vi.fn(),
    getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
    canvas: {},
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    BLEND: 0x0be2,
    SRC_ALPHA: 0x0302,
    ONE_MINUS_SRC_ALPHA: 0x0303,
    COLOR_BUFFER_BIT: 0x4000,
    TRIANGLES: 0x0004,
    UNSIGNED_SHORT: 0x1403,
  };
}

let mockGL: ReturnType<typeof createMockGLContext>;
let rafCallbacks: FrameRequestCallback[];

beforeEach(() => {
  vi.restoreAllMocks();

  mockGL = createMockGLContext();
  rafCallbacks = [];

  // Patch HTMLCanvasElement to return our mock WebGL context
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    (contextId: string) => {
      if (contextId === "webgl") {
        return mockGL as unknown as WebGLRenderingContext;
      }
      return null;
    },
  );

  // Capture rAF callbacks without executing them to avoid infinite recursion.
  // Tests that need the render path can flush one frame via flushOneFrame().
  let nextId = 1;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    rafCallbacks.push(cb);
    return nextId++;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

  // Mock ResizeObserver -- must be a class so it works with `new`
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
});

/**
 * Flush exactly one animation frame by invoking the first captured rAF
 * callback. The callback will schedule another rAF (captured but not
 * executed), so there is no infinite recursion.
 */
function flushOneFrame() {
  const cb = rafCallbacks.shift();
  if (cb) cb(performance.now());
}

describe("TerrainVisualizer", () => {
  it("renders a canvas element", () => {
    const { getByTestId } = render(<TerrainVisualizer analyserNode={null} />);
    const canvas = getByTestId("terrain-canvas");
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe("CANVAS");
  });

  it("canvas is hidden from assistive technology", () => {
    const { getByTestId } = render(<TerrainVisualizer analyserNode={null} />);
    const canvas = getByTestId("terrain-canvas");
    expect(canvas).toHaveAttribute("aria-hidden", "true");
  });

  it("initializes WebGL context on mount", () => {
    render(<TerrainVisualizer analyserNode={null} />);
    expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith(
      "webgl",
      { alpha: true, antialias: true },
    );
  });

  it("compiles shaders and creates program", () => {
    render(<TerrainVisualizer analyserNode={null} />);
    // Vertex + Fragment shaders
    expect(mockGL.createShader).toHaveBeenCalledTimes(2);
    expect(mockGL.compileShader).toHaveBeenCalledTimes(2);
    expect(mockGL.createProgram).toHaveBeenCalledTimes(1);
    expect(mockGL.linkProgram).toHaveBeenCalledTimes(1);
  });

  it("uploads grid geometry buffers", () => {
    render(<TerrainVisualizer analyserNode={null} />);
    // VBO + IBO + FFT attribute buffer
    expect(mockGL.createBuffer).toHaveBeenCalledTimes(3);
    expect(mockGL.bufferData).toHaveBeenCalledTimes(3);
  });

  it("starts animation frame loop on mount", () => {
    render(<TerrainVisualizer analyserNode={null} />);
    expect(window.requestAnimationFrame).toHaveBeenCalled();
  });

  it("sets uniforms and uploads FFT attribute during render frame", () => {
    render(<TerrainVisualizer analyserNode={null} />);
    flushOneFrame();
    // FFT attribute buffer update + uTime + uHasData
    expect(mockGL.bufferSubData).toHaveBeenCalled();
    expect(mockGL.uniform1f).toHaveBeenCalled();
  });

  it("draws elements with correct primitive type", () => {
    render(<TerrainVisualizer analyserNode={null} />);
    flushOneFrame();
    expect(mockGL.drawElements).toHaveBeenCalledWith(
      mockGL.TRIANGLES,
      expect.any(Number),
      mockGL.UNSIGNED_SHORT,
      0,
    );
  });

  it("passes uHasData=0 when analyserNode is null", () => {
    render(<TerrainVisualizer analyserNode={null} />);
    flushOneFrame();
    // The uniform1f calls include uTime and uHasData.
    // uHasData should be 0 when no analyser is connected.
    const calls = mockGL.uniform1f.mock.calls as [unknown, number][];
    const hasZeroCall = calls.some((call) => call[1] === 0);
    expect(hasZeroCall).toBe(true);
  });

  it("cleans up WebGL on unmount", () => {
    const { unmount } = render(<TerrainVisualizer analyserNode={null} />);
    unmount();
    expect(mockGL.getExtension).toHaveBeenCalledWith("WEBGL_lose_context");
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  it("reads FFT data from analyser when provided", () => {
    const mockAnalyser = {
      getByteFrequencyData: vi.fn((arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = 128;
        }
      }),
      fftSize: 256,
      frequencyBinCount: 128,
    } as unknown as AnalyserNode;

    render(<TerrainVisualizer analyserNode={mockAnalyser} />);
    flushOneFrame();
    expect(mockAnalyser.getByteFrequencyData).toHaveBeenCalled();
  });

  it("schedules another frame after rendering", () => {
    render(<TerrainVisualizer analyserNode={null} />);
    // First rAF was called on mount
    const initialCallCount = (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length;
    flushOneFrame();
    // After flushing one frame, another rAF should have been scheduled
    expect(
      (window.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBeGreaterThan(initialCallCount);
  });
});
