const { pbkdf2Sync, randomBytes } = require('crypto');

const PASSWORD_PBKDF2_ITERATIONS = 120000;

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }
    parsed[key] = next;
    i += 1;
  }
  return parsed;
}

function printUsage() {
  console.log('Usage: node scripts/generate-admin-password-hash.js --username gm --password your-password [--displayName 管理员]');
}

function hashPassword(password, salt, iterations = PASSWORD_PBKDF2_ITERATIONS) {
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = String(args.username || '').trim();
  const password = typeof args.password === 'string' ? args.password : '';
  const displayName = String(args.displayName || username || 'GM').trim();

  if (!username || !password) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const usernameLower = username.toLowerCase();
  const accountId = `admin_${randomBytes(8).toString('hex')}`;

  const doc = {
    id: accountId,
    username,
    usernameLower,
    displayName,
    passwordSalt: salt,
    passwordHash,
    passwordIterations: PASSWORD_PBKDF2_ITERATIONS,
    disabled: false,
    createdAt: '<serverDate()>',
    updatedAt: '<serverDate()>',
  };

  console.log(JSON.stringify(doc, null, 2));
}

main();
