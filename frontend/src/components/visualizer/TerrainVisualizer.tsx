import { useEffect, useRef, useCallback } from "react";

// --- GLSL Shaders ---
const VERT_SRC = `
  attribute vec2 aPosition;
  uniform float uFFT[128];
  uniform float uTime;
  uniform vec2 uResolution;
  uniform float uHasData;

  varying float vHeight;

  void main() {
    float col = aPosition.x;
    float row = aPosition.y;

    // Frequency magnitude from FFT (0-1 range)
    int idx = int(col);
    float mag = uFFT[idx];

    // Idle animation when no audio data
    float idle = sin(col * 0.08 + uTime * 0.5) * 0.15
               + sin(col * 0.03 - uTime * 0.3) * 0.1
               + sin(row * 0.12 + uTime * 0.4) * 0.08;

    float height = mix(idle, mag, uHasData);
    vHeight = height;

    // Map to NDC: x from -1 to 1, z (depth) from rows
    float x = (col / 128.0) * 2.0 - 1.0;
    float z = (row / 48.0) * 2.0 - 1.0;
    float y = height * 0.6;

    // Simple perspective tilt (rotate around X axis by ~25 degrees)
    float tilt = 0.42; // ~24 degrees in radians
    float cosT = cos(tilt);
    float sinT = sin(tilt);
    float newY = y * cosT - z * sinT;
    float newZ = y * sinT + z * cosT;

    // Perspective division
    float perspective = 1.0 / (2.5 - newZ * 0.5);
    gl_Position = vec4(x * perspective, newY * perspective, newZ * 0.1, 1.0);
  }
`;

const FRAG_SRC = `
  precision mediump float;
  varying float vHeight;

  void main() {
    // Dark base (neutral-900: ~23,23,23) to light peaks (neutral-300: ~212,212,212)
    float h = clamp(vHeight, 0.0, 1.0);
    float curve = pow(h, 0.7); // Bias toward darker tones
    float r = mix(0.09, 0.83, curve);
    float g = mix(0.09, 0.83, curve);
    float b = mix(0.09, 0.83, curve);
    float alpha = 0.3 + h * 0.7;
    gl_FragColor = vec4(r, g, b, alpha);
  }
`;

const GRID_COLS = 128;
const GRID_ROWS = 48;

interface TerrainVisualizerProps {
  analyserNode: AnalyserNode | null;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vs: WebGLShader,
  fs: WebGLShader,
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

function buildGridGeometry(): { vertices: Float32Array; indices: Uint16Array } {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      vertices.push(c, r);
    }
  }

  for (let r = 0; r < GRID_ROWS - 1; r++) {
    for (let c = 0; c < GRID_COLS - 1; c++) {
      const i = r * GRID_COLS + c;
      // Two triangles per quad
      indices.push(i, i + 1, i + GRID_COLS);
      indices.push(i + 1, i + GRID_COLS + 1, i + GRID_COLS);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
  };
}

interface GLState {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  indexCount: number;
  uniforms: {
    uFFT: WebGLUniformLocation | null;
    uTime: WebGLUniformLocation | null;
    uResolution: WebGLUniformLocation | null;
    uHasData: WebGLUniformLocation | null;
  };
}

export function TerrainVisualizer({ analyserNode }: TerrainVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glStateRef = useRef<GLState | null>(null);
  const animRef = useRef<number>(0);
  const fftRef = useRef<Float32Array>(new Float32Array(GRID_COLS));
  const smoothFFTRef = useRef<Float32Array>(new Float32Array(GRID_COLS));
  const startTimeRef = useRef<number>(performance.now());

  const initGL = useCallback(
    (canvas: HTMLCanvasElement): GLState | null => {
      const gl = canvas.getContext("webgl", { alpha: true, antialias: true });
      if (!gl) return null;

      const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      if (!vs || !fs) return null;

      const program = createProgram(gl, vs, fs);
      if (!program) return null;

      gl.useProgram(program);

      // Clean up individual shaders after linking
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      const { vertices, indices } = buildGridGeometry();

      // Upload vertex data
      const vbo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const aPos = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      // Upload index data
      const ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0.039, 0.039, 0.039, 1.0); // neutral-950

      // Cache uniform locations
      const uniforms = {
        uFFT: gl.getUniformLocation(program, "uFFT"),
        uTime: gl.getUniformLocation(program, "uTime"),
        uResolution: gl.getUniformLocation(program, "uResolution"),
        uHasData: gl.getUniformLocation(program, "uHasData"),
      };

      const state: GLState = {
        gl,
        program,
        indexCount: indices.length,
        uniforms,
      };

      glStateRef.current = state;
      return state;
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = initGL(canvas);
    if (!state) return;

    const { gl, program, indexCount, uniforms } = state;
    const fftData = new Uint8Array(GRID_COLS);

    const render = () => {
      if (!gl.canvas) return;

      // Resize if needed
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }

      // Get FFT data
      let hasData = 0;
      if (analyserNode) {
        analyserNode.getByteFrequencyData(fftData);
        let sum = 0;
        for (let i = 0; i < GRID_COLS; i++) {
          fftRef.current[i] = fftData[i] / 255.0;
          sum += fftData[i];
        }
        hasData = sum > 100 ? 1.0 : 0.0;
      }

      // Smooth FFT (lerp toward target)
      for (let i = 0; i < GRID_COLS; i++) {
        smoothFFTRef.current[i] +=
          (fftRef.current[i] - smoothFFTRef.current[i]) * 0.15;
      }

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      // Set uniforms
      gl.uniform1fv(uniforms.uFFT, smoothFFTRef.current);
      gl.uniform1f(
        uniforms.uTime,
        (performance.now() - startTimeRef.current) / 1000,
      );
      gl.uniform2f(uniforms.uResolution, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uHasData, hasData);

      gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    // ResizeObserver for responsive sizing
    const resizeObserver = new ResizeObserver(() => {
      // Resize is handled inside the render loop, but triggering a
      // layout measurement here ensures the canvas updates promptly.
    });
    resizeObserver.observe(canvas);

    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObserver.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      glStateRef.current = null;
    };
  }, [analyserNode, initGL]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
      data-testid="terrain-canvas"
    />
  );
}
