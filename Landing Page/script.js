(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");

  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

  var MAX_DEG = 3;
  var MAX_LIFT = 10;
  var MAX_SCALE = 1.012;

  var tiltNodes = [];
  var tiltActive = false;

  function resetTilt(node) {
    node.style.setProperty("--rx", "0deg");
    node.style.setProperty("--ry", "0deg");
    node.style.setProperty("--ty", "0px");
    node.style.setProperty("--s", "1");
    node.classList.remove("is-tilting");
  }

  function mountTilt(node) {
    if (node.dataset.tiltBound) return;
    node.dataset.tiltBound = "1";
    var frame = null;
    var pointerX = 0.5;
    var pointerY = 0.5;

    function render() {
      frame = null;
      var rx = (0.5 - pointerY) * MAX_DEG * 2;
      var ry = (pointerX - 0.5) * MAX_DEG * 2;
      node.style.setProperty("--rx", rx.toFixed(2) + "deg");
      node.style.setProperty("--ry", ry.toFixed(2) + "deg");
      node.style.setProperty("--ty", (-MAX_LIFT).toFixed(0) + "px");
      node.style.setProperty("--s", String(MAX_SCALE));
    }

    function schedule() {
      if (frame === null) frame = window.requestAnimationFrame(render);
    }

    function onMove(event) {
      var rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      pointerX = (event.clientX - rect.left) / rect.width;
      pointerY = (event.clientY - rect.top) / rect.height;
      node.classList.add("is-tilting");
      schedule();
    }

    function onLeave() {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      resetTilt(node);
    }

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    node.addEventListener("blur", onLeave);
  }

  function refreshTilt() {
    var enabled = hoverQuery.matches && !motionQuery.matches;
    if (enabled === tiltActive) return;
    tiltActive = enabled;
    tiltNodes.forEach(function (node) {
      if (enabled) {
        mountTilt(node);
      } else {
        resetTilt(node);
      }
    });
  }

  function setupTilt() {
    tiltNodes = Array.prototype.slice.call(document.querySelectorAll(".tilt"));
    if (!tiltNodes.length) return;
    tiltActive = false;
    refreshTilt();
    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", refreshTilt);
      hoverQuery.addEventListener("change", refreshTilt);
    }
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
    setupReveal();
    setupTilt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
