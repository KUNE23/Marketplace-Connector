<template>
  <div class="dashboard">
    <h1>Marketplace‑Connector Dashboard</h1>
    <button @click="testBackend">Test Backend</button>
    <pre v-if="status">{{ status }}</pre>
  </div>
</template>

<script>
export default {
  data() {
    return {
      status: ''
    };
  },
  methods: {
    async testBackend() {
      try {
        const res = await fetch('http://localhost:3000/api/status');
        const data = await res.json();
        this.status = JSON.stringify(data, null, 2);
      } catch (e) {
        this.status = 'Error: ' + e.message;
      }
    }
  }
};
</script>

<style scoped>
.dashboard {
  max-width: 800px;
  margin: 2rem auto;
  padding: 1rem;
  font-family: Arial, sans-serif;
}
button {
  padding: 0.5rem 1rem;
  margin-top: 1rem;
}
pre {
  background: #f4f4f4;
  padding: 1rem;
  margin-top: 1rem;
  overflow-x: auto;
}
</style>
