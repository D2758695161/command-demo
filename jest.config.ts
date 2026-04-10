import type { Config } from "jest";

const cfg: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.[jt]s$": "@swc/jest",
  },
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  coveragePathIgnorePatterns: ["node_modules", "mocks", "tests"],
  collectCoverage: true,
  coverageReporters: ["json", "lcov", "text", "clover", "json-summary"],
  reporters: ["default", "jest-junit", "jest-md-dashboard"],
  coverageDirectory: "coverage",
  testTimeout: 20000,
  roots: ["<rootDir>", "tests"],
  transformIgnorePatterns: [],
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  moduleNameMapper: {
    "^@octokit/webhooks-methods$": "<rootDir>/node_modules/@octokit/webhooks-methods/dist-node/index.js",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  setupFilesAfterEnv: ["dotenv/config"],
};

export default cfg;
