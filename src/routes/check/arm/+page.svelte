<script lang="ts">
  import CameraCheck from '#lib/components/CameraCheck.svelte';
</script>

<!-- Arm drift needs longer than the face check to show. -->
<CameraCheck id="arm" next="/check/speech" duration={10000} />
