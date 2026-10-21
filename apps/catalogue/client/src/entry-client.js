import { createSSRApp } from "vue";
import App from "./App.vue";
import "./theme.css";
const props = JSON.parse(document.getElementById("catalogue-data").textContent);
createSSRApp(App, props).mount("#app");
