# AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework.

# Testing and Verification
- Every implementation plan must be strictly tested locally or thoroughly verified against the stated goals before marking a goal as complete.
- Do not deploy or push changes blindly; verify the endpoints, UI states, and routing logic work as expected.
- You must document the testing steps and results in the verification section of the plan and the walkthrough artifact.
