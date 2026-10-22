/* 侧边栏目录：扫描正文标题生成目录，并高亮当前阅读位置。
   目录完全在浏览器端生成，不依赖 Jekyll 插件，GitHub Pages 可直接使用。 */
(function () {
  "use strict";

  var body = document.getElementById("note-body");
  var nav = document.getElementById("toc-nav");
  var toc = document.querySelector(".toc");
  var article = document.querySelector(".note");
  if (!body || !nav || !toc || !article) return;

  var headings = Array.prototype.slice.call(body.querySelectorAll("h2, h3"));

  // 标题太少时目录没有意义，直接隐藏侧边栏，正文改为单栏
  if (headings.length < 2) {
    toc.hidden = true;
    return;
  }

  var list = document.createElement("ol");
  list.className = "toc-list";
  var links = [];

  headings.forEach(function (heading, index) {
    // kramdown 一般会生成 id；缺失时补一个稳定的，保证锚点可用
    if (!heading.id) heading.id = "sec-" + (index + 1);

    var item = document.createElement("li");
    item.className = "toc-item toc-" + heading.tagName.toLowerCase();

    var link = document.createElement("a");
    link.href = "#" + heading.id;
    link.textContent = heading.textContent.replace(/^#+\s*/, "").trim();

    link.addEventListener("click", function (event) {
      event.preventDefault();
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", "#" + heading.id);
      setActive(heading.id);
      // 窄屏下选完目标就收起目录，避免挡住正文
      if (window.innerWidth < 1000) toc.classList.remove("is-open");
    });

    item.appendChild(link);
    list.appendChild(item);
    links.push(link);
  });

  nav.appendChild(list);
  article.classList.add("with-toc");

  function setActive(id) {
    links.forEach(function (link) {
      link.classList.toggle("is-active", link.getAttribute("href") === "#" + id);
    });
  }

  // 取最后一个已越过顶部的标题作为当前位置；还没读到第一个标题时不标记
  var ticking = false;
  function updateActive() {
    ticking = false;
    var offset = 120;
    var current = null;
    headings.forEach(function (heading) {
      if (heading.getBoundingClientRect().top <= offset) current = heading;
    });
    setActive(current ? current.id : "");
  }

  window.addEventListener("scroll", function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateActive);
  }, { passive: true });

  updateActive();

  // 窄屏下目录默认收起，点标题展开
  var title = toc.querySelector(".toc-title");
  if (title) {
    title.addEventListener("click", function () {
      var open = toc.classList.toggle("is-open");
      title.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
})();
