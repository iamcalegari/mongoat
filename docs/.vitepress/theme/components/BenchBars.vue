<script setup>
import { computed } from 'vue';

/**
 * Horizontal grouped-bar chart for the benchmarks page. Pure computed SVG —
 * no browser measurement — so it server-side renders under VitePress. Colours
 * come from CSS custom properties keyed by library name, so a light/dark theme
 * switch repaints without re-rendering. The library→hue map is validated with
 * the data-viz skill's palette checker (see benchmarks.md).
 *
 * Legibility: big bars, generous cluster gaps (no zebra — it muddied dark mode),
 * a dashed reference line that reads as "baseline" against the solid data bars,
 * and a light tie band. A group may carry `highlight` + `note` to call out an
 * operation where the subject library pulls ahead of the field.
 */
const props = defineProps({
  // [{ label, note?, highlight?, bars: [{ key, value, note? }] }]
  groups: { type: Array, required: true },
  max: { type: Number, required: true },
  unit: { type: String, default: '' },
  // Draw a vertical reference line (e.g. the native-driver baseline at 100).
  reference: { type: Number, default: null },
  referenceLabel: { type: String, default: '' },
  // Shaded "indistinguishable" region [low, high] in the same units as max.
  band: { type: Array, default: null },
  bandLabel: { type: String, default: '' },
  // Decimal places for the direct value labels.
  decimals: { type: Number, default: 0 },
  // Single-measure charts (one bar per row) name themselves via the row label,
  // so the colour legend is redundant noise — drop it.
  hideLegend: { type: Boolean, default: false },
});

const W = 760;
const LABEL_W = 184; // left gutter for group names + notes
const RIGHT_PAD = 56; // room for the value label at each bar tip
const BOTTOM_PAD = 34; // axis label
const BAR_H = 24;
const BAR_GAP = 4; // within a cluster (bars belong together)
const GROUP_GAP = 26; // between clusters (breathing room)

const topPad = computed(() => (props.hideLegend ? 24 : 48));

const x0 = LABEL_W;
const x1 = W - RIGHT_PAD;

const layout = computed(() => {
  let y = topPad.value;
  const rows = [];
  props.groups.forEach((g, gi) => {
    const blockH = g.bars.length * BAR_H + (g.bars.length - 1) * BAR_GAP;
    rows.push({ group: g, y, blockH, midY: y + blockH / 2 });
    y += blockH;
    if (gi < props.groups.length - 1) y += GROUP_GAP;
  });
  return { rows, height: y + BOTTOM_PAD };
});

const legend = computed(() => {
  const seen = new Map();
  props.groups.forEach((g) =>
    g.bars.forEach((b) => {
      if (!seen.has(b.key)) seen.set(b.key, true);
    })
  );
  return [...seen.keys()];
});

function xScale(v) {
  return x0 + (Math.min(v, props.max) / props.max) * (x1 - x0);
}

/** Bar path: square at the baseline (left), rounded at the data-end (right). */
function barPath(w, y) {
  const r = Math.min(5, w, BAR_H / 2);
  if (w <= 0.5) return `M${x0},${y} h1 v${BAR_H} h-1 Z`;
  const xe = x0 + w;
  return (
    `M${x0},${y} H${xe - r} A${r},${r} 0 0 1 ${xe},${y + r} ` +
    `V${y + BAR_H - r} A${r},${r} 0 0 1 ${xe - r},${y + BAR_H} H${x0} Z`
  );
}

/** A bar that leaves the tie band is the news — draw its label bold. */
function outOfBand(v) {
  if (!props.band) return false;
  return v < props.band[0] || v > props.band[1];
}

function fmt(v) {
  return v.toFixed(props.decimals) + props.unit;
}
</script>

<template>
  <figure class="bench-chart">
    <svg
      :viewBox="`0 0 ${W} ${layout.height}`"
      role="img"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- tie band: within the run's own noise of the baseline -->
      <g v-if="band">
        <rect
          class="noise-band"
          :x="xScale(band[0])"
          :y="topPad - 8"
          :width="xScale(band[1]) - xScale(band[0])"
          :height="layout.height - topPad - BOTTOM_PAD + 8"
        />
        <text
          v-if="bandLabel"
          class="band-lbl"
          :x="(xScale(band[0]) + xScale(band[1])) / 2"
          :y="topPad - 11"
          text-anchor="middle"
        >
          {{ bandLabel }}
        </text>
      </g>

      <!-- baseline axis at 0 -->
      <line
        class="axis"
        :x1="x0"
        :x2="x0"
        :y1="topPad - 8"
        :y2="layout.height - BOTTOM_PAD"
      />

      <!-- reference line (dashed = baseline, not data) -->
      <g v-if="reference != null">
        <line
          class="ref-line"
          :x1="xScale(reference)"
          :x2="xScale(reference)"
          :y1="topPad - 8"
          :y2="layout.height - BOTTOM_PAD"
        />
        <text
          class="ref-txt"
          :x="xScale(reference)"
          :y="layout.height - BOTTOM_PAD + 18"
          text-anchor="middle"
        >
          {{ referenceLabel }}
        </text>
      </g>

      <!-- legend -->
      <g v-if="!hideLegend" class="legend" :transform="`translate(${x0}, 22)`">
        <g
          v-for="(key, i) in legend"
          :key="key"
          :transform="`translate(${i * 128}, 0)`"
        >
          <rect
            :class="`fill-${key}`"
            x="0"
            y="-10"
            width="13"
            height="13"
            rx="2.5"
          />
          <text x="19" y="0" class="legend-txt">{{ key }}</text>
        </g>
      </g>

      <!-- groups -->
      <g v-for="row in layout.rows" :key="row.group.label">
        <text
          :class="`group-lbl${row.group.highlight ? ' is-highlight' : ''}`"
          :x="x0 - 14"
          :y="row.group.note ? row.midY - 3 : row.midY + 5"
          text-anchor="end"
        >
          {{ row.group.label }}
        </text>
        <text
          v-if="row.group.note"
          class="group-note"
          :x="x0 - 14"
          :y="row.midY + 13"
          text-anchor="end"
        >
          {{ row.group.note }}
        </text>
        <g v-for="(bar, bi) in row.group.bars" :key="bar.key">
          <path
            :class="`bar fill-${bar.key}`"
            :d="barPath(xScale(bar.value) - x0, row.y + bi * (BAR_H + BAR_GAP))"
          >
            <title>
              {{ bar.key }} — {{ row.group.label }}: {{ fmt(bar.value)
              }}{{ bar.note ? ` (${bar.note})` : '' }}
            </title>
          </path>
          <text
            :class="`val-lbl${outOfBand(bar.value) ? ' val-callout' : ''}`"
            :x="xScale(bar.value) + 7"
            :y="row.y + bi * (BAR_H + BAR_GAP) + BAR_H - 7"
          >
            {{ fmt(bar.value) }}
          </text>
        </g>
      </g>
    </svg>
  </figure>
</template>

<style scoped>
.bench-chart {
  margin: 1.75rem 0;
  /* Library → hue. Validated (light & dark) with the data-viz palette checker.
     native=blue, mongoat=green (brand), papr=magenta, mongoose=yellow. */
  --lib-native: #2a78d6;
  --lib-mongoat: #008300;
  --lib-papr: #e87ba4;
  --lib-mongoose: #eda100;
  --band: rgba(90, 88, 82, 0.09);
}
:global(.dark) .bench-chart {
  --lib-native: #3987e5;
  --lib-mongoat: #6fce74;
  --lib-papr: #d55181;
  --lib-mongoose: #c98500;
  --band: rgba(255, 255, 255, 0.05);
}

.bench-chart svg {
  width: 100%;
  height: auto;
  font-family: var(--vp-font-family-base);
}

.fill-native {
  fill: var(--lib-native);
}
.fill-mongoat {
  fill: var(--lib-mongoat);
}
.fill-papr {
  fill: var(--lib-papr);
}
.fill-mongoose {
  fill: var(--lib-mongoose);
}

.bar {
  transition: opacity 0.12s;
}
.bar:hover {
  opacity: 0.82;
  cursor: default;
}

/* Structural guides and every text label ride VitePress's own theme tokens, so
   they are calibrated for light AND dark instead of being hand-mixed greys that
   wash out on the dark surface. Text never wears a series colour. */
.noise-band {
  fill: var(--band);
}
.axis {
  stroke: var(--vp-c-divider);
  stroke-width: 1;
}
.ref-line {
  stroke: var(--vp-c-text-3);
  stroke-width: 1.5;
  stroke-dasharray: 5 3;
}

.group-lbl {
  fill: var(--vp-c-text-1);
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
}
.group-lbl.is-highlight {
  fill: var(--vp-c-brand-1);
  font-weight: 650;
}
.group-note {
  fill: var(--vp-c-brand-1);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.legend-txt {
  fill: var(--vp-c-text-1);
  font-size: 13px;
  dominant-baseline: middle;
}
.val-lbl {
  fill: var(--vp-c-text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.val-callout {
  fill: var(--vp-c-text-1);
  font-weight: 650;
}
.ref-txt {
  fill: var(--vp-c-text-2);
  font-size: 12px;
}
.band-lbl {
  fill: var(--vp-c-text-2);
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
</style>
