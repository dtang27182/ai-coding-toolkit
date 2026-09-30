# Implementation Dataflow Report: <feature>

- Graph: `<feature>.cr.impl-dataflow.json`
- Patch: `<feature>.patch`
- User-flow context: `<feature>.diff-description.md`

## Changes the Schema Cannot Represent

<!-- Repeat this entry only for production implementation changes the schema cannot represent. Write "None." when there are no findings. -->

### <Short description of the change>

- File: `<repository-relative path>`
- Diff location: <patch line range and exact @@ hunk header; use the file header for changes without a hunk>
- Change: <what was added, modified, or deleted>
- Schema limitation: <why the change cannot be represented>
- Graph impact: <what the graph omits or represents only partially>

## Unresolved Discrepancies

<!-- Repeat this entry for each unresolved discrepancy. Write "None." when there are no findings. -->

### <Short description of the discrepancy>

- Sources and locations: <relevant graph entity or relationship, patch file and hunk location, implementation file and lines with base/target identified, or diff-description flow and step>
- Discrepancy: <what the sources disagree about>
- Evidence: <what each relevant source shows>
- Unresolved because: <why the discrepancy remains>
- Graph impact: <how the discrepancy affects the graph's accuracy or interpretation>
