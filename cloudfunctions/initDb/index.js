const cloud = require('wx-server-sdk');
const { DEFAULT_ADMIN_ACCOUNTS } = require('./common/admin/AdminSeed');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTIONS = [
  'users',
  'pve_saves',
  'pve_balance_configs',
  'admin_accounts',
  'admin_sessions',
  'admin_logs',
];

const NOT_EXIST = -502005;

function isCollectionMissingError(err) {
  const code = err.errCode || err.errcode;
  return code === NOT_EXIST || String(err.message || '').includes('not exist');
}

async function ensureCollection(name) {
  try {
    const { total } = await db.collection(name).count();
    return {
      collection: name,
      status: 'ok',
      created: false,
      message: `collection exists (${total} docs)`,
    };
  } catch (err) {
    if (!isCollectionMissingError(err)) {
      return {
        collection: name,
        status: 'error',
        created: false,
        message: err.message || String(err),
      };
    }

    try {
      if (typeof db.createCollection !== 'function') {
        return {
          collection: name,
          status: 'error',
          created: false,
          message: 'createCollection API is unavailable in current runtime',
        };
      }

      await db.createCollection(name);

      const { total } = await db.collection(name).count();

      return {
        collection: name,
        status: 'ok',
        created: true,
        message: `collection created (${total} docs)`,
      };
    } catch (createErr) {
      return {
        collection: name,
        status: 'error',
        created: false,
        message: `create failed: ${createErr.message || String(createErr)}`,
      };
    }
  }
}

async function ensureAdminAccount(account) {
  const usernameLower = String(account.usernameLower || '').trim().toLowerCase();
  if (!usernameLower) {
    return {
      username: account.username || '',
      status: 'error',
      created: false,
      message: 'missing usernameLower',
    };
  }

  const { data } = await db.collection('admin_accounts').where({ usernameLower }).limit(1).get();
  const existing = data[0];

  if (existing) {
    await db.collection('admin_accounts').doc(existing._id).update({
      data: {
        username: account.username,
        usernameLower: account.usernameLower,
        displayName: account.displayName,
        passwordSalt: account.passwordSalt,
        passwordHash: account.passwordHash,
        passwordIterations: account.passwordIterations,
        disabled: account.disabled === true,
        updatedAt: db.serverDate(),
      },
    });
    return {
      username: account.username,
      status: 'ok',
      created: false,
      message: 'admin account updated',
    };
  }

  await db.collection('admin_accounts').add({
    data: {
      id: account.id,
      username: account.username,
      usernameLower: account.usernameLower,
      displayName: account.displayName,
      passwordSalt: account.passwordSalt,
      passwordHash: account.passwordHash,
      passwordIterations: account.passwordIterations,
      disabled: account.disabled === true,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });

  return {
    username: account.username,
    status: 'ok',
    created: true,
    message: 'admin account created',
  };
}

exports.main = async () => {
  const collectionResults = [];

  for (const name of COLLECTIONS) {
    collectionResults.push(await ensureCollection(name));
  }

  const collectionOk = collectionResults.every((item) => item.status === 'ok' || item.status === 'warning');
  const adminResults = [];

  if (collectionOk) {
    for (const account of DEFAULT_ADMIN_ACCOUNTS) {
      try {
        adminResults.push(await ensureAdminAccount(account));
      } catch (err) {
        adminResults.push({
          username: account.username,
          status: 'error',
          created: false,
          message: err.message || String(err),
        });
      }
    }
  }

  const allOk = collectionOk && adminResults.every((item) => item.status === 'ok');
  return {
    ok: allOk,
    env: cloud.DYNAMIC_CURRENT_ENV,
    results: collectionResults,
    adminResults,
    nextSteps: allOk
      ? [
          '1. create indexes from cloud/database/indexes.md',
          '2. configure security rules from cloud/database/SETUP.md',
          '3. use start-gm.bat and sign in with the seeded admin account',
        ]
      : [
          '1. review failed collection/admin results',
          '2. deploy and run initDb again',
          '3. continue with index and security setup',
        ],
  };
};
