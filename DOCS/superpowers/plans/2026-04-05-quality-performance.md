# 품질/성능 개선 Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 잔여 `any` 10건 완전 제거, 스킵된 테스트 복구, DependencyGraph 성능 최적화로 프로젝트 품질과 성능을 한 단계 끌어올린다.

**Architecture:** 3개 Phase — P1(타입 완전성) → P2(성능 최적화) → P3(테스트 복구) 순서로 진행. Native FFI 타입(`native/index.d.ts`)을 활용하여 `any` 타입을 구체적 타입으로 교체하고, DependencyGraph의 O(n) 선형탐색을 Set 기반으로 개선하며, setImmediate 오버헤드를 줄인다.

**Tech Stack:** TypeScript 5.x, Vitest, NAPI-RS (Rust FFI)

---

## Phase 1: 잔여 any 10건 완전 제거 (Tasks 1-3)
## Phase 2: 성능 최적화 (Tasks 4-5)
## Phase 3: 스킵된 테스트 복구 (Tasks 6-7)
## Phase 4: 최종 검증 (Task 8)
