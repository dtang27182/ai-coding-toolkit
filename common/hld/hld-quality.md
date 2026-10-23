# HLD Design Quality

The goal is to minimize end-state complexity while fully satisfying the confirmed High Level Requirements within the confirmed scope. For feature designs, realize the confirmed User Journeys. Minimize change complexity wherever doing so does not increase end-state complexity.

Behavior should be easy to trace through direct paths with few unnecessary special cases.

## Design Principles

Use these principles together to minimize overall end-state complexity. Introduce boundaries, abstractions, and layers when they make responsibilities clearer, reduce coupling, or simplify how behavior is implemented and understood.

1. **Cohesion and clear ownership**

   Each component should own a coherent responsibility. Group behavior that belongs together and is expected to change for the same reasons.

   Each piece of mutable state should have a clear owner. Keep decisions and operations that mutate state near that owner, minimizing coordination across unrelated components. Avoid distributing one responsibility across several components or routing unrelated work repeatedly through a central coordinator.

2. **Consistent abstraction levels**

   Child entities under the same parent should have comparable roles and operate at comparable levels of abstraction. The parent should have a clear responsibility for coordinating or composing those children.

   For example, a page supporting sign-in through three providers should coordinate three provider-specific sign-in pages. Implementing one provider directly in the parent creates an inconsistent division of responsibilities.

   Introduce delegation where it makes the structure clearer. Additional layers should earn their place through meaningful responsibilities.

3. **Information hiding and meaningful contracts**

   Classes that primarily contain data should expose their fields publicly, without trivial getters or setters.

   Classes that primarily process data or model state machines should keep instance variables and implementation mechanics private, so they can change without requiring changes in consumers. Do not expose those instance variables through getters or setters.

   Interfaces should represent meaningful operations or concepts within the application. Their names, inputs, and outputs should reflect that meaning, so consumers can use them without understanding the component's internal mechanics.

4. **Appropriate reuse**

   Share logic when its occurrences represent the same responsibility and should evolve together. Base reuse on shared meaning and expected evolution.

   Extract helpers or classes when the reduction in duplication outweighs added indirection and coupling. With fewer than three uses, generally keep logic local unless it must stay synchronized or sharing reduces end-state complexity. Treat usage count as a heuristic; each abstraction should have a clear responsibility grounded in demonstrated needs.

5. **Architectural cohesion and change isolation**

   Design existing and new behavior as a coherent whole. Reorganize the existing architecture when it reduces end-state complexity, including redrawing higher-level component boundaries, creating new groupings, or restructuring the component hierarchy. Place behavior according to its responsibility in the resulting architecture, with clear, explicit integration points. Avoid feature-specific structures that fragment an existing responsibility or distort the system around its implementation history.

   Where doing so does not increase end-state complexity, concentrate as much new behavior as possible in one cohesive subcomponent and minimize the interactions and dataflows between it and the rest of the system. This should make the changed behavior understandable largely within that subcomponent, narrow the scope of review, and make disabling or rolling back the behavior straightforward.

Explain consequential design choices and tradeoffs briefly in the HLD's design rationale, using the requirements and current code as evidence. Show how the choices reduce overall end-state complexity. Keep the change easy to understand and avoid changes that provide no benefit to the required behavior or end-state simplicity.
