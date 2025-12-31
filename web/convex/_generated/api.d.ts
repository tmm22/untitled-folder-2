/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as history from "../history.js";
import type * as http from "../http.js";
import type * as pipelines from "../pipelines.js";
import type * as provisioning from "../provisioning.js";
import type * as session from "../session.js";
import type * as transit from "../transit.js";
import type * as translations from "../translations.js";
import type * as users from "../users.js";
import type * as workspaceLayouts from "../workspaceLayouts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  history: typeof history;
  http: typeof http;
  pipelines: typeof pipelines;
  provisioning: typeof provisioning;
  session: typeof session;
  transit: typeof transit;
  translations: typeof translations;
  users: typeof users;
  workspaceLayouts: typeof workspaceLayouts;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
