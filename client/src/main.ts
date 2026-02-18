import { mount } from 'svelte';
import './lib/combat-theme.css';
import App from './App.svelte';

const params = new URLSearchParams(window.location.search);

const app = mount(App, {
  target: document.getElementById('app')!,
  props: {
    combatId: params.get('combatId') || '',
    zone: params.get('zone') || '',
    apiKey: params.get('apiKey') || '',
    encounterType: (params.get('encounterType') || 'mob') as 'mob' | 'gate_boss' | 'world_boss',
    mode: (params.get('mode') || 'turnbased') as 'turnbased' | 'realtime' | '3d' | 'builder' | 'world',
  },
});

export default app;
