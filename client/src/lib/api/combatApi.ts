let storedApiKey = '';

export function setApiKey(key: string) {
  storedApiKey = key;
}

function headers(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': storedApiKey,
  };
}

export async function getCombatState(combatId: string) {
  const res = await fetch(`/api/combat/${combatId}`, { headers: headers() });
  if (!res.ok) throw new Error(`Failed to fetch combat: ${res.status}`);
  return res.json();
}

export async function submitAction(combatId: string, stance: string, action: { type: string; abilityId?: string }) {
  const res = await fetch(`/api/combat/${combatId}/action`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ stance, action }),
  });
  if (!res.ok) throw new Error(`Failed to submit action: ${res.status}`);
  return res.json();
}
