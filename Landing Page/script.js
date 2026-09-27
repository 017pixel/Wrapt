/* global window, document, IntersectionObserver */
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  function setupSmoothScroll() {
    var links = Array.prototype.slice.call(document.querySelectorAll('a[href^="#"]'));
    if (!links.length) return;
    var header = document.querySelector(".topbar");

    function headerOffset() {
      var height = header ? header.getBoundingClientRect().height : 0;
      return Math.round(height + 16);
    }

    links.forEach(function (link) {
      link.addEventListener("click", function (event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        var href = link.getAttribute("href");
        if (!href || href === "#") return;
        var target = document.getElementById(href.slice(1));
        if (!target) return;

        event.preventDefault();
        var top = target.getBoundingClientRect().top + window.pageYOffset - headerOffset();
        if (top < 0) top = 0;
        window.scrollTo({ top: top, behavior: motionQuery.matches ? "auto" : "smooth" });

        if (window.history && typeof window.history.pushState === "function") {
          window.history.pushState(null, "", href);
        } else {
          window.location.hash = href;
        }
        if (typeof target.focus === "function") {
          try { target.focus({ preventScroll: true }); } catch { target.focus(); }
        }
      });
    });
  }

  function setupReveal() {
    var nodes = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (!nodes.length) return;

    function showAll() {
      nodes.forEach(function (node) { node.classList.add("is-visible"); });
    }

    if (!("IntersectionObserver" in window)) {
      showAll();
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -8% 0px" });

    nodes.forEach(function (node) { observer.observe(node); });
  }

  function init() {
    setupSmoothScroll();
    setupReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
