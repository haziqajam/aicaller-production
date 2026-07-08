/**
 * Curated GPU list for fleet presets.
 *
 * The project deploys on RunPod and pins GPU-specific Docker images (see
 * `caller/Dockerfile.backend.5090`, `caller/Dockerfile.bot.3090`, and
 * `caller/config.py` → `fleet_default_gpu`). These names mirror RunPod's GPU
 * type strings so the orchestrator can request the matching pod.
 *
 * Each entry's `value` is the exact string stored on the preset (`gpuType`).
 */
export type GpuOption = {
  value: string;
  label: string;
  /** Short architecture / tier hint shown in the dropdown row. */
  hint: string;
};

export const GPU_OPTIONS: GpuOption[] = [
  // Consumer GPUs the project explicitly targets in its Docker work.
  { value: "NVIDIA GeForce RTX 3090", label: "RTX 3090", hint: "Ampere · 24GB" },
  { value: "NVIDIA GeForce RTX 4090", label: "RTX 4090", hint: "Ada · 24GB" },
  { value: "NVIDIA GeForce RTX 5090", label: "RTX 5090", hint: "Blackwell · 32GB" },
  // Common RunPod datacenter GPUs.
  { value: "NVIDIA A100 80GB PCIe", label: "A100 80GB", hint: "Ampere · datacenter" },
  { value: "NVIDIA L40S", label: "L40S", hint: "Ada · datacenter" },
  { value: "NVIDIA RTX A6000", label: "RTX A6000", hint: "Ampere · 48GB" },
];

export const DEFAULT_GPU = "NVIDIA GeForce RTX 4090";

/** `Record<value, label>` shape required by the Base UI `<Select items>` prop. */
export const GPU_ITEMS: Record<string, string> = Object.fromEntries(
  GPU_OPTIONS.map((o) => [o.value, o.label])
);
