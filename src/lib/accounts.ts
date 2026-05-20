export interface Account {
  label: string;
  password: string;
  sessionKey: string;
}

function getAccounts(): Account[] {
  return [
    {
      label: process.env.SELLER_LABEL || 'Кирилл',
      password: process.env.SITE_PASSWORD || '',
      sessionKey: process.env.SESSION_SECRET || '',
    },
    {
      label: 'Илья',
      password: process.env.ILYA_SESSION_KEY || '346bkmz421',
      sessionKey: process.env.ILYA_SESSION_KEY || '346bkmz421',
    },
  ].filter(a => a.password !== '' && a.sessionKey !== '');
}

export function findAccountByPassword(password: string): Account | undefined {
  return getAccounts().find(a => a.password === password);
}

export function findAccountBySession(sessionKey: string): Account | undefined {
  return getAccounts().find(a => a.sessionKey === sessionKey);
}
