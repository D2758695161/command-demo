import { customOctokit } from "@ubiquity-os/plugin-sdk/octokit";
import { handleCommentCreated, handleCommentEdited } from "./handlers/run-demo";
import { Context } from "./types/index";
import { isCommentCreatedEvent, isCommentEditedEvent } from "./types/typeguards";

const BAD_CREDENTIALS_MESSAGE = "The credentials provided for the GitHub user are invalid, the demo cannot proceed.";

export async function runPlugin(context: Context) {
  const { logger, eventName } = context;

  if (shouldIgnoreEvent(context)) {
    logger.info(`Ignoring event: ${eventName}`);
    return;
  }
  const user = await getGitHubUser(context);
  context.userName = user.login;
  if (isCommentCreatedEvent(context)) {
    return await handleCommentCreated(context);
  } else if (isCommentEditedEvent(context)) {
    return await handleCommentEdited(context);
  }

  logger.error(`Unsupported event: ${eventName}`);
}

async function getGitHubUser(context: Context) {
  try {
    context.userOctokit = new customOctokit({
      auth: context.env.USER_GITHUB_TOKEN,
    });
    const { data: user } = await context.userOctokit.rest.users.getAuthenticated();
    return user;
  } catch (err) {
    throw context.logger.error(BAD_CREDENTIALS_MESSAGE, { err });
  }
}

function shouldIgnoreEvent(context: Context) {
  if (isCommentCreatedEvent(context)) {
    const content = context.payload.comment.body;
    return content.includes(BAD_CREDENTIALS_MESSAGE);
  }
  return false;
}
