# Describe HLD Entities for the Visualizer

Add `generalDescription` and `designRole` to every class, method, and component in the Architecture Diff. Ground descriptions in the current code and HLD. Keep each field to three sentences or fewer.

Change only these two fields. Preserve entity membership, relationships, change types, user-flow labels, and metrics.

## generalDescription

- Explain what the entity does in the overall software system, independently of this HLD.
- For classes, describe responsibilities and owned state; for methods, outcomes and side effects; for components, capabilities or interfaces.
- Read relevant implementation, callers, consumers, and state owners beyond the diagram's scope without expanding diagram membership.
- Avoid HLD references, change types, user-flow step numbers, and restatements of the entity's name.

## designRole

- Summarize the entity's part in this HLD and how it supports the desired behavior.
- Explain relevant collaboration, data processing, state ownership, user interaction, or proposed changes, including removal.
- Describe its contribution rather than listing relationships or restating its change type.

## Validation

- Verify both fields are nonblank, contain three sentences or fewer, and are supported by the code or HLD on every entity.
- Confirm `generalDescription` stands alone and `designRole` agrees with the narrative and Architecture Diff.
- Verify that only these two fields changed. Validate the updated Architecture Diff and open it in the visualizer to check the inspector descriptions.
- Record description generation success or failure separately in the iteration summary and disclose failures in the handoff.
