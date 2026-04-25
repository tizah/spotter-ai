---
name: test
description: Run the full test suite — backend pytest and frontend vitest.
disable-model-invocation: true
allowed-tools: Bash
---

# Run Full Test Suite

Run backend and frontend tests in sequence and report results.

## Commands

```bash
# Backend tests
cd /Users/davidzagi/Projects/spotter-project/backend
source .venv/bin/activate && pytest -v

# Frontend tests
cd /Users/davidzagi/Projects/spotter-project/frontend
npm test
```

Run both test suites. Report the pass/fail counts for each. If any test fails, show the failure details.
