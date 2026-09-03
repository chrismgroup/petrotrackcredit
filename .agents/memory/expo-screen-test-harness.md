---
name: Expo screen test harness
description: Native import mocks and react-test-renderer query behavior for lightweight Expo screen tests.
---

Expo screen tests that use lightweight React Native mocks must also mock every native-only module imported by the screen, even when the test never invokes that module's actions. The test renderer can expose both the mocked component wrapper and its host node, so interaction queries should target the host primitive when accessibility props are duplicated.

**Why:** Importing an unmocked Expo native module can fail before any test runs, and querying both wrapper layers makes a single rendered control look like two controls.

Jest hoists mock factories, so factories that render test primitives should obtain React with `require('react')` inside the factory instead of closing over the file-level React import.

**How to apply:** When adding an Expo screen to the guarded test suite, mirror its native module imports and every rendered React Native primitive with inert mocks, require React inside hoisted factories, and filter interaction queries by the mocked host component type when necessary.