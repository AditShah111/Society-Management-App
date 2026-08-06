Rule: The agent must ALWAYS automate deployment to Render. 
1. When a task is complete, always run `git commit` and `git push` immediately so that Render's Auto-Deploy is triggered.
2. Never ask the user to manually click "Manual Deploy" on the Render dashboard. Assume that pushing to the `main` branch will automatically push the changes to Render.
3. If the user provides a Render Deploy Hook, use `curl` to trigger it.
