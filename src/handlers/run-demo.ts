import { Context } from "../types/index";

async function isUserAdmin({ payload, octokit, logger }: Context) {
  const username = payload.sender.login;
  try {
    await octokit.rest.orgs.getMembershipForUser({
      org: payload.repository.owner.login,
      username,
    });
    return true;
  } catch (e) {
    logger.debug(`${username} is not a member of ${payload.repository.owner.login}`, { e });
  }
  const permissionLevel = await octokit.rest.repos.getCollaboratorPermissionLevel({
    username,
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
  });
  const role = permissionLevel.data.role_name?.toLowerCase();
  logger.debug(`Retrieved collaborator permission level for ${username}.`, {
    username,
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    isAdmin: permissionLevel.data.user?.permissions?.admin,
    role,
    data: permissionLevel.data,
  });
  return !!permissionLevel.data.user?.permissions?.admin;
}

async function createDemoIssue({ octokit, payload, logger, userName }: Context) {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  // Bot posts the demo issue on behalf of the user (privacy: user doesn't post from their account)
  const { data: issue } = await octokit.rest.issues.create({
    owner,
    repo,
    title: `Demo Issue for @${userName}`,
    body: `Interactive UbiquityOS demo initiated by @${userName}.

This demo showcases how UbiquityOS streamlines development workflows with AI-powered task management, automated pricing, and smart contract payments.

Welcome! Let's get started.`,
  });
  logger.info(`Created demo issue #${issue.number} on behalf of user ${userName}`);
  return issue;
}

export async function handleCommentCreated(context: Context<"issue_comment.created">) {
  const { payload, logger, octokit, userName, userOctokit } = context;

  const body = payload.comment.body;
  const repo = payload.repository.name;
  const owner = payload.repository.owner.login;
  const issueNumber = payload.issue.number;

  if (body.trim().startsWith("/demo")) {
    if (!(await isUserAdmin(context))) {
      throw logger.error("You do not have admin privileges thus cannot start a demo.");
    }
    logger.info("Processing /demo command");
    await handleInit(context);
  } else if (body.includes("command-start-stop") && body.includes(userName)) {
    logger.info("Processing ubiquity-os-command-start-stop post comment");
    const pr = await createPullRequest(context);
    await octokit.rest.pulls.merge({
      owner,
      repo,
      pull_number: pr.data.number,
    });
  } else if (body.includes("command-wallet") && body.includes(userName)) {
    // User has registered their wallet - proceed with demo
    await userOctokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: `Now I can self assign to this task!

We have a built-in command called \`/start\` which also does some other checks before assignment, including seeing how saturated we are with other open GitHub issues now. This ensures that contributors don't "bite off more than they can chew."

When pricing is set on any GitHub Issue, they will be automatically populated in our [DevPool Directory](https://devpool.directory) making it easy for contributors to discover and join new projects.`,
    });
    await userOctokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: `/start`,
    });

    // Nudge user to claim their rewards after the pricing plugin posts the reward comment
    await userOctokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body: `Your DEMO reward has been posted above! Click the link in the reward comment to claim your tokens. If you need to set up a wallet first, use \`/wallet <YOUR_ETHEREUM_ADDRESS>\` and then re-run \`/start\`.`,
    });
  }
}

export async function handleCommentEdited(context: Context<"issue_comment.edited">) {
  const { eventName } = context;
  if (eventName === "issue_comment.edited") {
    context.logger.debug("handleCommentEdited: ignoring for now", {});
  }
}

async function createPullRequest({ payload, logger, userOctokit, userName }: Context) {
  const sourceRepo = payload.repository.name;
  const sourceIssueNumber = payload.issue.number;
  const sourceOwner = payload.repository.owner.login;
  const newRepoName = `${sourceRepo}-${sourceOwner}`;

  logger.info(`Creating fork for user`, {
    owner: sourceOwner,
    repo: sourceRepo,
  });

  await userOctokit.rest.repos.createFork({
    owner: sourceOwner,
    repo: sourceRepo,
  });

  logger.debug("Waiting for the fork to be ready...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  logger.debug(`Updating fork name to: ${newRepoName}`);
  await userOctokit.rest.repos.update({
    owner: userName,
    repo: sourceRepo,
    name: newRepoName,
  });

  const { data: repoData } = await userOctokit.rest.repos.get({
    owner: sourceOwner,
    repo: sourceRepo,
  });
  const defaultBranch = repoData.default_branch;

  const { data: refData } = await userOctokit.rest.git.getRef({
    owner: sourceOwner,
    repo: sourceRepo,
    ref: `heads/${defaultBranch}`,
  });
  const ref = `fix/${crypto.randomUUID()}`;

  await userOctokit.rest.git.createRef({
    owner: userName,
    repo: newRepoName,
    ref: `refs/heads/${ref}`,
    sha: refData.object.sha,
  });
  const { data: commit } = await userOctokit.rest.git.getCommit({
    owner: userName,
    repo: newRepoName,
    commit_sha: refData.object.sha,
  });
  const { data: newCommit } = await userOctokit.rest.git.createCommit({
    owner: userName,
    repo: newRepoName,
    message: "chore: empty commit",
    tree: commit.tree.sha,
    parents: [refData.object.sha],
  });
  await userOctokit.rest.git.updateRef({
    owner: userName,
    repo: newRepoName,
    ref: `heads/${ref}`,
    sha: newCommit.sha,
  });
  return await userOctokit.rest.pulls.create({
    owner: sourceOwner,
    repo: sourceRepo,
    head: `${userName}:${ref}`,
    base: defaultBranch,
    body: `Resolves #${sourceIssueNumber}`,
    title: ref,
  });
}

export async function handleInit(context: Context<"issue_comment.created">) {
  const { payload, userOctokit, logger, userName } = context;

  const repo = payload.repository.name;
  const issueNumber = payload.issue.number;
  const owner = payload.repository.owner.login;

  logger.info("Starting demo", { owner, repo, issueNumber });

  // Bot posts the demo issue on behalf of the user (privacy: user doesn't post from their account)
  await createDemoIssue({ ...context, octokit: context.octokit, userOctokit });

  await userOctokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `Hey there @${payload.repository.owner.login}, and welcome! This interactive demo highlights how UbiquityOS streamlines development workflows. Here's what you can expect:

- All functions are installable from our @ubiquity-os-marketplace, letting you tailor your management configurations for any organization or repository.
- We'll walk you through key capabilities-AI-powered task matching, automated pricing calculations, and smart contract integration for payments.
- Adjust settings globally across your org or use local repo overrides. More details on repository config can be found [here](https://github.com/0x4007/ubiquity-os-demo-kljiu/blob/development/.github/.ubiquity-os.config.yml).

### Getting Started
- Try out the commands you see. Feel free to experiment with different tasks and features.
- Create a [new issue](new) at any time to reset and begin anew.
- Use \`/help\` if you'd like to see additional commands.

Enjoy the tour!`,
  });

  // Ask user to register their wallet BEFORE starting demo tasks
  await userOctokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: `Before we begin, please register your wallet address so you can claim your rewards!

Run the following command in this issue to register:

\`/wallet <YOUR_ETHEREUM_ADDRESS>\`

For example: \`/wallet 0x...\` (replacing with your actual Ethereum address)

Once you've registered, I'll guide you through the demo tasks and you'll be able to claim your rewards at the end.`,
  });
}
