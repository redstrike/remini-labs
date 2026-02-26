<script lang="ts">
  import '../app.css';
  let { children } = $props();
</script>

<svelte:head>
  <title>Mini App Lab</title>
  <meta name="description" content="SvelteKit super-app shell with hosted mini-apps" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0D0E14" />
</svelte:head>

{@render children()}
