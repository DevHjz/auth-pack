// Copyright 2026 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

const SERVER_URL = "https://sso.devhjz.com";
const REDIRECT_PATH = "http://casdoor-authenticator";
const SIGNIN_PATH = "/api/signin";

export const tenantConfigs = Object.freeze({
  cloud: Object.freeze({
    displayName: "黄发科技集团租户",
    serverUrl: SERVER_URL,
    clientId: "b39a5ad6d95848ffde82",
    organizationName: "Cloud",
    appName: "Cloud",
    redirectPath: REDIRECT_PATH,
    signinPath: SIGNIN_PATH,
  }),
  publicIam: Object.freeze({
    displayName: "公共认证服务租户",
    serverUrl: SERVER_URL,
    clientId: "6f6a7b4337ffb3d3ee3f",
    organizationName: "Public-IAM",
    appName: "Public-APP",
    redirectPath: REDIRECT_PATH,
    signinPath: SIGNIN_PATH,
  }),
});

export const getTenantConfig = (tenant) => tenantConfigs[tenant] || null;

export const tenantLoginMethods = Object.freeze([
  "cloud",
  "publicIam",
]);
