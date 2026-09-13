const STYLES: Array<[string, string]> = [
  ['gradient', 'Gradient'],
  ['mesh', 'Mesh gradient'],
  ['lowpoly', 'Low-poly'],
  ['plasma', 'Plasma'],
  ['solid', 'Solid'],
];

export interface GeneratorSelection {
  style: string;
  seed: string;
}

export function createGeneratorPanel(onChange: (selection: GeneratorSelection) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'panel-section';

  const label = document.createElement('label');
  label.textContent = 'Style';
  label.className = 'panel-label';

  const select = document.createElement('select');
  select.className = 'field';
  for (const [value, text] of STYLES) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  }

  const seedRow = document.createElement('div');
  seedRow.className = 'seed-row';
  const seedInput = document.createElement('input');
  seedInput.className = 'field';
  seedInput.value = randomSeed();
  seedInput.placeholder = 'Seed';
  const rerollButton = document.createElement('button');
  rerollButton.type = 'button';
  rerollButton.className = 'button button-secondary';
  rerollButton.textContent = 'Reroll';
  rerollButton.addEventListener('click', () => {
    seedInput.value = randomSeed();
    emit();
  });
  seedRow.append(seedInput, rerollButton);

  function emit(): void {
    onChange({ style: select.value, seed: seedInput.value });
  }
  select.addEventListener('change', emit);
  seedInput.addEventListener('input', emit);
  emit();

  wrap.append(label, select, seedRow);
  return wrap;
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
