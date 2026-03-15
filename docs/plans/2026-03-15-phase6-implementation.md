# Phase 6: Polish & Ship Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Production-quality DX, toast notifications, keyboard shortcuts, drag-drop, loading states, terrain mesh visualizer, spectral waterfall, and micro-interactions.

**Architecture:** Mostly frontend -- new Zustand store for toasts, WebGL canvas for terrain, Canvas 2D for waterfall, Framer Motion for micro-interactions. One setup script for DX.

**Tech Stack:** Raw WebGL (GLSL shaders), Canvas 2D, Web Audio AnalyserNode, Framer Motion, Zustand, bash

---

## Task List

### Task 1: Setup scripts (start.sh + stop.sh)
### Task 2: Toast notification store + component
### Task 3: Wire toasts into existing operations
### Task 4: Keyboard shortcuts
### Task 5: Global drag-drop upload
### Task 6: Loading states + micro-interactions (Framer Motion)
### Task 7: Terrain mesh WebGL visualizer
### Task 8: Spectral waterfall (Canvas 2D)
### Task 9: E2E tests + final verification

## Execution Order

- Task 1 (standalone, no deps)
- Tasks 2-5 (can parallel -- independent frontend features)
- Task 6 (depends on existing components)
- Tasks 7-8 (can parallel -- independent visualizers)
- Task 9 (depends on all)
