# Sequential Agent Queue Skill

Automated sequential execution of multi-stage agent workflows with dependency passing and progress tracking. Compatible with AgentSkills specification and OpenClaw.

**Version:** 2.0 (2026-02-16)

## Quick Start

```javascript
const { executeWorkflow } = require('./queue.js');

const workflow = {
    name: 'my-workflow',
    stages: [
        { name: 'stage1', task: '...', dependencies: [] },
        { name: 'stage2', task: '...', dependencies: ['stage1'] }
    ]
};

await executeWorkflow(workflow);
```

## Features

- Dependency-aware sequential execution
- Governance enforcement (VERIFICATION_PROTOCOL)
- Evidence validation and git commits
- Progress tracking and error recovery

## Documentation

See [SKILL.md](./SKILL.md) for full documentation.

## License

Proprietary - AOmni internal skill
