<script lang="ts">
  import type { PlayerClass } from '../stores/types';
  import { CLASS_DEFS } from '../three/ClassDefs';

  let { onSelect }: { onSelect: (cls: PlayerClass) => void } = $props();

  let hoveredClass = $state<PlayerClass | null>(null);
  let selectedClass = $state<PlayerClass | null>(null);

  const classOrder: PlayerClass[] = ['sentinel', 'reaver', 'shade', 'warden', 'corsair', 'pyromancer', 'void_weaver'];

  const roleIcons: Record<string, string> = {
    'Tank': '\u{1F6E1}',
    'Melee DPS': '\u{2694}',
    'Melee Assassin': '\u{1F5E1}',
    'Ranged Physical': '\u{1F3F9}',
    'Ranged Thrown': '\u{1F4A5}',
    'Fire Mage': '\u{1F525}',
    'Shadow Mage': '\u{1F30C}',
  };

  function handleSelect(cls: PlayerClass) {
    selectedClass = cls;
    setTimeout(() => onSelect(cls), 400);
  }
</script>

<div class="class-select-overlay" class:fade-out={selectedClass !== null}>
  <div class="class-select-content">
    <h1 class="title">Choose Your Path</h1>
    <p class="subtitle">Each soul enters the hollows differently</p>

    <div class="class-grid">
      {#each classOrder as classId}
        {@const cls = CLASS_DEFS[classId]}
        {@const isHovered = hoveredClass === classId}
        {@const isSelected = selectedClass === classId}
        <button
          class="class-card"
          class:hovered={isHovered}
          class:selected={isSelected}
          style="--accent: {cls.color}"
          onmouseenter={() => hoveredClass = classId}
          onmouseleave={() => hoveredClass = null}
          onclick={() => handleSelect(classId)}
        >
          <div class="card-header">
            <span class="class-name">{cls.name}</span>
            <span class="role-tag">{roleIcons[cls.role] || ''} {cls.role}</span>
          </div>
          <p class="class-desc">{cls.description}</p>
          <div class="stat-bars">
            <div class="stat-row">
              <span class="stat-label">HP</span>
              <div class="stat-track">
                <div class="stat-fill hp-fill" style="width: {(cls.hp / 180) * 100}%"></div>
              </div>
              <span class="stat-val">{cls.hp}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">STA</span>
              <div class="stat-track">
                <div class="stat-fill sta-fill" style="width: {(cls.stamina / 110) * 100}%"></div>
              </div>
              <span class="stat-val">{cls.stamina}</span>
            </div>
          </div>
          <div class="ability-preview">
            {#each cls.abilities.filter(a => a.slot !== 'primary') as ab}
              <span class="ability-pip" title={ab.name}>{ab.slot.toUpperCase()}</span>
            {/each}
          </div>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .class-select-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: radial-gradient(ellipse at center, rgba(18,12,8,0.95) 0%, rgba(5,5,10,0.98) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.5s ease;
    overflow-y: auto;
    padding: 24px;
  }
  .class-select-overlay.fade-out {
    animation: fadeOut 0.4s ease forwards;
  }

  .class-select-content {
    text-align: center;
    max-width: 900px;
    width: 100%;
  }

  .title {
    font-family: 'MedievalSharp', cursive;
    font-size: 42px;
    color: var(--ember-orange, #ff6b35);
    text-shadow: 0 0 30px rgba(255,107,53,0.5), 0 2px 8px rgba(0,0,0,0.8);
    margin-bottom: 4px;
    letter-spacing: 2px;
  }
  .subtitle {
    font-family: 'Cinzel', serif;
    font-size: 14px;
    color: var(--muted, #888);
    margin-bottom: 28px;
    letter-spacing: 1px;
  }

  .class-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .class-card {
    background: rgba(18,18,26,0.92);
    border: 2px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 16px;
    text-align: left;
    cursor: pointer;
    transition: all 0.25s ease;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    overflow: hidden;
  }
  .class-card::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at top, color-mix(in srgb, var(--accent) 8%, transparent) 0%, transparent 70%);
    pointer-events: none;
  }
  .class-card.hovered {
    border-color: var(--accent);
    transform: translateY(-3px);
    box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 25%, transparent),
                0 8px 24px rgba(0,0,0,0.5);
  }
  .class-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 40px color-mix(in srgb, var(--accent) 50%, transparent);
    transform: scale(1.03);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .class-name {
    font-family: 'MedievalSharp', cursive;
    font-size: 20px;
    color: var(--accent);
    text-shadow: 0 0 10px color-mix(in srgb, var(--accent) 40%, transparent);
  }
  .role-tag {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    color: var(--muted, #888);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .class-desc {
    font-family: 'Cinzel', serif;
    font-size: 11px;
    color: rgba(232,220,196,0.7);
    line-height: 1.5;
    margin: 0;
    min-height: 48px;
  }

  .stat-bars {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .stat-label {
    font-family: 'Cinzel', serif;
    font-size: 9px;
    color: var(--muted, #888);
    width: 24px;
    text-align: right;
    letter-spacing: 1px;
  }
  .stat-track {
    flex: 1;
    height: 6px;
    background: rgba(255,255,255,0.06);
    border-radius: 3px;
    overflow: hidden;
  }
  .stat-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.3s ease;
  }
  .hp-fill {
    background: linear-gradient(90deg, #ff3333, #ff6b35);
  }
  .sta-fill {
    background: linear-gradient(90deg, #3b82f6, #8b5cf6);
  }
  .stat-val {
    font-family: 'Cinzel', serif;
    font-size: 10px;
    color: rgba(232,220,196,0.6);
    width: 28px;
  }

  .ability-preview {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }
  .ability-pip {
    width: 24px;
    height: 24px;
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Cinzel', serif;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    background: rgba(0,0,0,0.3);
  }

  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }

  @media (max-width: 768px) {
    .title { font-size: 28px; }
    .class-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .class-card { padding: 12px; }
  }
  @media (max-width: 480px) {
    .class-grid { grid-template-columns: 1fr; }
  }
</style>
