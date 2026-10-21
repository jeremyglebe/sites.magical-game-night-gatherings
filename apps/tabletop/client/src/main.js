import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import "./theme.css";
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "table",
      component: () => import("./pages/TablePage.vue"),
    },
    {
      path: "/games",
      name: "games",
      component: () => import("./pages/GamesPage.vue"),
    },
    {
      path: "/games/:id",
      name: "review",
      component: () => import("./pages/GameReviewPage.vue"),
    },
    { path: "/:pathMatch(.*)*", redirect: "/games" },
  ],
  scrollBehavior: () => ({ top: 0 }),
});
createApp(App).use(router).mount("#app");
