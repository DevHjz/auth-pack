// Copyright 2024 The Casdoor Authors. All Rights Reserved.
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

import {eq} from "drizzle-orm";
import i18next from "i18next";
import * as schema from "./db/schema";
import * as api from "./api";
import {generateToken} from "./totpUtil";
import useStore from "./useStorage";

function handleTokenExpiration() {
  const {clearAll} = useStore.getState();
  clearAll();
}

function getLocalAccounts(db) {
  return db.select({
    account: schema.accounts,
    syncAt: schema.accountSyncCheckpoints.syncAt,
  })
    .from(schema.accounts)
    .leftJoin(schema.accountSyncCheckpoints, eq(schema.accounts.id, schema.accountSyncCheckpoints.accountId))
    .all()
    .map(({account, syncAt}) => ({...account, syncAt: syncAt ?? account.syncAt}));
}

function getAccountKey(account) {
  return `${account.accountName}:${account.issuer ?? ""}`;
}

function updateLocalDatabase(db, accounts, localAccounts) {
  const localAccountsById = new Map(localAccounts.map(account => [account.id, account]));
  return db.transaction((tx) => {
    for (const account of accounts) {
      if (account.id) {
        if (account.deletedAt === null || account.deletedAt === undefined) {
          const localAccount = localAccountsById.get(account.id);
          if (!localAccount) {
            throw new Error(`Account ${account.id} was not present in the sync snapshot`);
          }
          if (localAccount.issuer === (account.issuer ?? null) &&
            localAccount.accountName === account.accountName &&
            localAccount.secretKey === account.secretKey &&
            localAccount.deletedAt === (account.deletedAt ?? null) &&
            localAccount.origin === (account.origin ?? null)
          ) {
            continue;
          }
          tx.update(schema.accounts).set({
            issuer: account.issuer,
            accountName: account.accountName,
            secretKey: account.secretKey,
            deletedAt: null,
            token: generateToken(account.secretKey),
            changedAt: new Date(),
            origin: account.origin,
          }).where(eq(schema.accounts.id, account.id)).run();
        } else {
          tx.delete(schema.accounts).where(eq(schema.accounts.id, account.id)).run();
        }
      } else {
        tx.insert(schema.accounts).values({
          issuer: account.issuer || null,
          accountName: account.accountName,
          secretKey: account.secretKey,
          origin: account.origin || null,
          token: generateToken(account.secretKey),
        }).run();
      }
    }
  });
}

function mergeAccounts(localAccounts, serverAccounts, serverTimestamp) {
  const isNewer = (a, b) => new Date(a) > new Date(b);

  const mergedAccounts = new Map();
  const localAccountKeys = new Map();

  // Process local accounts
  for (const local of localAccounts) {
    const key = getAccountKey(local);
    mergedAccounts.set(key, {
      ...local,
      synced: false,
    });

    // Store both current and old account keys for local accounts
    localAccountKeys.set(key, local);
    if (local.oldAccountName) {
      const oldKey = getAccountKey({...local, accountName: local.oldAccountName});
      localAccountKeys.set(oldKey, local);
    }
  }

  const processedLocalKeys = new Set();

  // Merge with server accounts
  for (const server of serverAccounts) {
    const serverKey = getAccountKey(server);
    const localAccount = localAccountKeys.get(serverKey);

    if (!localAccount) {
      // New account from server
      mergedAccounts.set(serverKey, {...server, synced: true});
    } else {
      const localKey = getAccountKey(localAccount);
      const local = mergedAccounts.get(localKey);

      if (isNewer(serverTimestamp, local.changedAt)) {
        // Server has newer changes
        mergedAccounts.set(localKey, {
          ...server,
          id: local.id,
          oldAccountName: local.accountName !== server.accountName ? local.accountName : local.oldAccountName,
          synced: true,
        });
      } else if (local.accountName !== server.accountName) {
        mergedAccounts.set(localKey, {
          ...local,
          oldAccountName: server.accountName,
          synced: false,
        });
      }
      // If local is newer or deleted, keep the local version (already in mergedAccounts)
      processedLocalKeys.add(localKey);
    }
  }

  // Handle server-side deletions
  for (const [key, local] of mergedAccounts) {
    if (!processedLocalKeys.has(key) && local.syncAt && isNewer(serverTimestamp, local.syncAt)) {
      // This account was not found on the server and was previously synced
      // Mark it as deleted
      mergedAccounts.set(key, {...local, deletedAt: new Date(), synced: true});
    }
  }

  return Array.from(mergedAccounts.values());
}

export async function syncWithCloud(db, userInfo, serverUrl, token) {
  const localAccounts = await getLocalAccounts(db);

  try {
    await api.validateToken(serverUrl, token);
  } catch (error) {
    handleTokenExpiration();
    throw error;
  }

  const {updatedTime, mfaAccounts: serverAccounts} = await api.getMfaAccounts(
    serverUrl,
    userInfo.owner,
    userInfo.name,
    token
  );

  const mergedAccounts = mergeAccounts(localAccounts, serverAccounts, updatedTime);

  updateLocalDatabase(db, mergedAccounts, localAccounts);

  const accountsToSync = mergedAccounts
    .filter(account => account.deletedAt === null || account.deletedAt === undefined)
    .map(account => {
      const {issuer, accountName, secretKey, origin} = account;
      const accountToSync = {issuer, accountName, secretKey};
      if (origin !== null) {
        accountToSync.origin = origin;
      }
      return accountToSync;
    });

  const serverAccountsStringified = serverAccounts.map(account => {
    const {issuer, accountName, secretKey, origin} = account;
    const accountStringified = {issuer, accountName, secretKey};
    if (origin !== null) {
      accountStringified.origin = origin;
    }
    return JSON.stringify(accountStringified);
  });

  const accountsToSyncStringified = accountsToSync.map(account => JSON.stringify(account));

  if (JSON.stringify(accountsToSyncStringified.sort()) !== JSON.stringify(serverAccountsStringified.sort())) {
    const {status} = await api.updateMfaAccounts(
      serverUrl,
      userInfo.owner,
      userInfo.name,
      accountsToSync,
      token
    );

    if (status !== "ok") {
      throw new Error(i18next.t("syncLogic.Sync failed"));
    }
  }

  const currentAccountIds = db.select({id: schema.accounts.id}).from(schema.accounts).all().map(({id}) => id);
  const syncAt = new Date();
  db.transaction((tx) => {
    tx.delete(schema.accountSyncCheckpoints).run();
    if (currentAccountIds.length > 0) {
      tx.insert(schema.accountSyncCheckpoints).values(
        currentAccountIds.map(accountId => ({accountId, syncAt}))
      ).run();
    }
  });

}
