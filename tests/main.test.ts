import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { CommentHandler } from "@ubiquity-os/plugin-sdk";
import { customOctokit as Octokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import manifest from "../manifest.json";
import { runPlugin } from "../src";
import { Context, Env } from "../src/types/index";
import { db } from "./__mocks__/db";
import { createComment, setupTests } from "./__mocks__/helpers";
import { server } from "./__mocks__/node";
import { STRINGS } from "./__mocks__/strings";

const octokit = new Octokit();

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
});
afterAll(() => server.close());

describe("Plugin tests", () => {
  beforeEach(async () => {
    drop(db);
    await setupTests();
  });

  it("Should serve the manifest file", async () => {
    const worker = (await import("../src/worker")).default;
    const response = await worker.fetch(new Request("http://localhost/manifest.json"), {
      USER_GITHUB_TOKEN: "",
    });
    const content = await response.json();
    expect(content).toEqual(manifest);
  });

  it("Should handle an issue comment event", async () => {
    const { context, infoSpy, errorSpy } = createContext();

    expect(context.eventName).toBe("issue_comment.created");
    expect(context.payload.comment.body).toBe("/demo");

    await runPlugin(context);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenNthCalledWith(1, "Processing /demo command");
  }, 50000);
});

function createContext(
  configurableResponse: string = "Hello, world!", // we pass the plugin configurable items here
  commentBody: string = "/demo",
  repoId: number = 1,
  payloadSenderId: number = 1,
  commentId: number = 1,
  issueOne: number = 1
) {
  const repo = db.repo.findFirst({ where: { id: { equals: repoId } } }) as unknown as Context["payload"]["repository"];
  const sender = db.users.findFirst({ where: { id: { equals: payloadSenderId } } }) as unknown as Context["payload"]["sender"];
  const issue1 = db.issue.findFirst({ where: { id: { equals: issueOne } } }) as unknown as Context<"issue_comment.created">["payload"]["issue"];

  createComment(commentBody, commentId); // create it first then pull it from the DB and feed it to _createContext
  const comment = db.issueComments.findFirst({ where: { id: { equals: commentId } } }) as unknown as Context<"issue_comment.created">["payload"]["comment"];

  const context = createContextInner(repo, sender, issue1, comment, configurableResponse);
  const infoSpy = jest.spyOn(context.logger, "info");
  const errorSpy = jest.spyOn(context.logger, "error");
  const debugSpy = jest.spyOn(context.logger, "debug");
  const okSpy = jest.spyOn(context.logger, "ok");
  const verboseSpy = jest.spyOn(context.logger, "verbose");

  return {
    context,
    infoSpy,
    errorSpy,
    debugSpy,
    okSpy,
    verboseSpy,
    repo,
    issue1,
  };
}

/**
 * Creates the context object central to the plugin.
 *
 * This should represent the active `SupportedEvents` payload for any given event.
 */
function createContextInner(
  repo: Context["payload"]["repository"],
  sender: Context["payload"]["sender"],
  issue: Context<"issue_comment.created">["payload"]["issue"],
  comment: Context<"issue_comment.created">["payload"]["comment"],
  configurableResponse: string
) {
  return {
    eventName: "issue_comment.created",
    command: null,
    payload: {
      action: "created",
      sender: sender,
      repository: repo,
      issue: issue,
      comment: comment,
      installation: { id: 1 } as Context["payload"]["installation"],
      organization: { login: STRINGS.USER_1 } as Context["payload"]["organization"],
    },
    logger: new Logs("debug"),
    config: {
      configurableResponse,
    },
    env: {} as Env,
    octokit: octokit,
    commentHandler: new CommentHandler(),
  } as unknown as Context<"issue_comment.created">;
}
