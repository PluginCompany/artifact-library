const scriptBase = new URL('.', document.currentScript.src);
const chart = document.querySelector('#chart');
if (chart) {
  let metric = 'publishes', days = 7, data = [];
  const labels = { publishes: 'Publications', downloads: 'Downloads' };
  const namespace = 'http://www.w3.org/2000/svg';
  function element(type, attributes, content) {
    const node = document.createElementNS(namespace, type);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function render() {
    const displayed = data.slice(-days);
    const width = 640, height = 264, left = 36, right = 15, top = 24, bottom = 38;
    const chartHeight = height - top - bottom;
    const max = Math.ceil(Math.max(...displayed.map(day => day[metric])) / 10) * 10;
    const svg = element('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${labels[metric]} over ${days} days` });
    for (let tick = 0; tick <= 4; tick++) {
      const y = top + chartHeight * (1 - tick / 4);
      svg.append(element('line', { x1: left, x2: width - right, y1: y, y2: y, class: 'grid' }));
      svg.append(element('text', { x: left - 9, y: y + 4, 'text-anchor': 'end', class: 'label' }, String(Math.round(max * tick / 4))));
    }
    const slot = (width - left - right) / displayed.length;
    displayed.forEach((day, index) => {
      const barHeight = day[metric] / max * chartHeight;
      const bar = element('rect', { x: left + slot * index + slot * .2, y: top + chartHeight - barHeight, width: slot * .6, height: barHeight, rx: 4, class: 'bar', tabindex: 0, role: 'button', 'aria-label': `${day.label}: ${day[metric]} ${labels[metric].toLowerCase()}` });
      bar.append(element('title', {}, `${day.label}: ${day[metric]} ${labels[metric].toLowerCase()}`));
      const inspect = () => {
        svg.querySelectorAll('.bar').forEach(node => node.removeAttribute('data-selected'));
        bar.setAttribute('data-selected', 'true');
        document.querySelector('#insight').textContent = `${day.label}: ${day[metric]} ${labels[metric].toLowerCase()}.`;
      };
      bar.addEventListener('click', inspect);
      bar.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(); } });
      svg.append(bar, element('text', { x: left + slot * (index + .5), y: height - 11, 'text-anchor': 'middle', class: 'label' }, day.short));
    });
    chart.replaceChildren(svg);
    document.querySelector('#total').textContent = String(displayed.reduce((sum, day) => sum + day[metric], 0));
    document.querySelector('#total-label').textContent = `${labels[metric]} in view`;
    document.querySelector('#metric-label').textContent = labels[metric];
    document.querySelector('#insight').textContent = 'Select a bar to inspect a day.';
    const table = document.querySelector('#data-table');
    table.replaceChildren(...displayed.map(day => {
      const row = document.createElement('tr');
      [day.label, day[metric]].forEach(value => { const cell = document.createElement('td'); cell.textContent = String(value); row.append(cell); });
      return row;
    }));
  }
  document.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => {
    metric = button.dataset.metric;
    document.querySelectorAll('[data-metric]').forEach(other => { const active = other === button; other.classList.toggle('active', active); other.setAttribute('aria-pressed', String(active)); });
    if (data.length) render();
  }));
  document.querySelector('#period').addEventListener('change', event => { days = Number(event.target.value); if (data.length) render(); });
  fetch(new URL('activity.json', scriptBase)).then(response => { if (!response.ok) throw new Error('Dataset unavailable'); return response.json(); }).then(result => { data = result.days; render(); }).catch(() => {
    chart.textContent = 'The chart could not load its local dataset.';
    document.querySelector('#chart-error').textContent = 'Try reloading this page or download the included CSV.';
  });
}
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const command = button.parentElement.querySelector('code').textContent;
  const status = document.querySelector('#copy-status');
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(command);
    else {
      const input = document.createElement('textarea'); input.value = command; input.style.cssText = 'position:fixed;left:-9999px'; document.body.append(input); input.select();
      const copied = document.execCommand('copy'); input.remove(); if (!copied) throw new Error('Copy unavailable');
    }
    status.textContent = 'Command copied.';
    button.textContent = 'Copied';
  } catch { status.textContent = 'Select the command text and copy it manually.'; }
}));
