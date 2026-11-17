/* Plataforma Araticum (Etapa 11). Lê os arquivos gerados por scripts/11_web.py.
   A AGB aparece só como nível do período (D20); o NDVI Landsat é só TM e ETM+ (D21). */
(function () {
  "use strict";

  var meta = null, camadaPol = null, camadaPts = null, selecionado = null, grafico = null;
  var cache = {}, atual = null, anoAtual = 2024;
  var porGid = {};

  function el(id) { return document.getElementById(id); }
  function num(v, casas) { return v.toFixed(casas).replace(".", ","); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ── mapa ──────────────────────────────────────────────────────────────────
  var mapa = L.map("mapa", { zoomControl: true, preferCanvas: false }).setView([-15.7, -49.5], 7);
  L.control.scale({ imperial: false }).addTo(mapa);
  // Esri, como na página do SBSR: o CARTO passou a exigir chave de API.
  var esri = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  var bases = {
    "Satélite": L.tileLayer(esri + "World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 19, attribution: "Esri, Maxar, Earthstar Geographics" }),
    "Escuro": L.tileLayer(esri + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, attribution: "Esri, HERE, Garmin, &copy; OpenStreetMap" }),
    "Claro": L.tileLayer(esri + "Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 16, attribution: "Esri, HERE, Garmin, &copy; OpenStreetMap" })
  };
  L.control.layers(bases, null, { position: "bottomright" }).addTo(mapa);

  function corDe(p) { return p.classe === null ? meta.cor_neutra : meta.classes[p.classe].cor; }
  function estiloPol(f) {
    var p = f.properties, sel = selecionado === p.gid;
    return {
      color: sel ? "#ffffff" : corDe(p), weight: sel ? 3 : 2, fillColor: corDe(p),
      fillOpacity: p.classe === null ? 0.08 : 0.35, dashArray: p.situacao === "fora do domínio do modelo" ? "4 4" : null
    };
  }
  function estiloPt(p) {
    var sel = selecionado === p.gid, fora = p.situacao === "fora do domínio do modelo";
    return {
      radius: sel ? 9 : 7, weight: sel ? 3 : (fora ? 2 : 1.5), color: sel ? "#ffffff" : (fora ? meta.cor_neutra : "#0d0e11"),
      fillColor: corDe(p), fillOpacity: fora ? 0 : 0.95, dashArray: fora ? "3 3" : null
    };
  }
  function rotuloMapa(p) {
    var v = p.nivel_t_ha === null ? p.situacao : num(p.nivel_t_ha, 1) + " t/ha";
    return "<b>" + p.gid + "</b> · " + esc(p.municipio) + "<br>" + esc(v);
  }
  // folgas do enquadramento: o mapa fica atrás dos painéis, então a área útil é o que sobra deles
  function estreita() { return window.innerWidth < 700; }
  function folgas(m) {
    var tl = [m, m], br = [m, m], W = window.innerWidth, H = window.innerHeight;
    var p = el("painel").getBoundingClientRect(), d = el("detalhe");
    if (estreita()) tl[1] = p.bottom + m; else tl[0] = p.right + m;
    if (!d.hidden) {
      var r = d.getBoundingClientRect();
      if (estreita()) br[1] = H - r.top + m; else br[0] = W - r.left + m;
    }
    return { paddingTopLeft: tl, paddingBottomRight: br };
  }
  function redesenhar() {
    camadaPol.setStyle(estiloPol);
    camadaPts.eachLayer(function (l) { l.setStyle(estiloPt(l.options.props)); });
  }

  // ── legenda e seletor ─────────────────────────────────────────────────────
  function legenda() {
    var h = "";
    meta.classes.forEach(function (c) {
      h += '<div class="cls"><i style="background:' + c.cor + '"></i><span>' + esc(c.rotulo) +
        '</span><span class="n">' + c.n + "</span></div>";
    });
    h += '<div class="cls"><i style="background:' + meta.cor_neutra + '"></i><span>poucos anos no domínio do modelo' +
      '</span><span class="n">' + meta.situacoes["poucos anos no domínio do modelo"] + "</span></div>";
    h += '<div class="cls"><i class="oco"></i><span>fora do domínio do modelo</span><span class="n">' +
      meta.situacoes["fora do domínio do modelo"] + "</span></div>";
    el("legenda").innerHTML = h;
    var ops = meta.poligonos.slice().sort(function (a, b) { return a.gid - b.gid; }).map(function (p) {
      var v = p.nivel_t_ha === null ? "sem nível" : num(p.nivel_t_ha, 1) + " t/ha";
      return '<option value="' + p.gid + '">' + p.gid + " · " + esc(p.municipio) + " · início " + p.ano_inicio +
        " · " + v + "</option>";
    });
    el("seletor").insertAdjacentHTML("beforeend", ops.join(""));
  }

  // ── painel do polígono ────────────────────────────────────────────────────
  function carregar(gid) {
    if (cache[gid]) return Promise.resolve(cache[gid]);
    return fetch("dados/poligonos/" + gid + ".json").then(function (r) {
      if (!r.ok) throw new Error("JSON do polígono " + gid + ": HTTP " + r.status);
      return r.json();
    }).then(function (j) { cache[gid] = j; return j; });
  }

  function abrir(gid, opcoes) {
    gid = +gid;
    return carregar(gid).then(function (j) {
      atual = j; selecionado = gid;
      el("seletor").value = String(gid);
      el("detalhe").hidden = false;
      el("d-titulo").textContent = "Polígono " + gid;
      el("d-projeto").textContent = j.projeto.nome + " · " + j.projeto.municipio;
      preencherAgb(j); preencherFicha(j); preencherRessalvas(j); preencherTabela(j);
      el("csv").href = j.csv; el("csv").setAttribute("download", "araticum_" + gid + ".csv");
      definirAno(opcoes && opcoes.ano ? opcoes.ano : anoAtual);
      desenharGrafico(j);
      redesenhar();
      if (estreita()) dobrarPainel(true);
      if (!(opcoes && opcoes.semZoom)) {
        var lyr = null;
        camadaPol.eachLayer(function (l) { if (l.feature.properties.gid === gid) lyr = l; });
        if (lyr) mapa.flyToBounds(lyr.getBounds(), Object.assign(folgas(60), { maxZoom: 16, duration: 0.8 }));
      }
      return j;
    });
  }

  function preencherAgb(j) {
    var a = j.agb;
    el("agb-nums").hidden = !a.mostra_nivel;
    el("v-situacao").hidden = a.mostra_nivel;
    if (a.mostra_nivel) {
      el("v-nivel").innerHTML = num(a.nivel_t_ha, 1) + "<span> t/ha</span>";
      el("v-intervalo").innerHTML = num(a.p10_t_ha, 1) + " a " + num(a.p90_t_ha, 1) + "<span> t/ha</span>";
      el("v-agb-nota").textContent = "Mediana da AGB prevista em " + a.n_anos_dominio + " anos no domínio do modelo. " +
        "O intervalo é de referência (P10 e P90 de um RF auxiliar), sem garantia de cobertura: cobriu 78 % da AGB " +
        "de campo no treino. A variação de um ano para outro não mede crescimento e não é mostrada.";
    } else {
      el("v-nivel").textContent = ""; el("v-intervalo").textContent = "";
      el("v-situacao").innerHTML = "<b>" + esc(a.situacao.charAt(0).toUpperCase() + a.situacao.slice(1)) + ".</b> " +
        (a.situacao === "fora do domínio do modelo"
          ? "Em nenhum ano as variáveis de satélite deste ponto ficam perto das áreas de treino. A AGB prevista aqui seria extrapolação e não é mostrada."
          : "Só " + a.n_anos_dominio + " ano(s) no domínio do modelo; o nível pede " + meta.min_anos_nivel + " ou mais.");
      el("v-agb-nota").textContent = "A imagem e o NDVI continuam válidos para acompanhar a área.";
    }
  }

  function preencherFicha(j) {
    var p = j.projeto, s = j.suporte;
    var linhas = [
      ["Projeto", p.nome], ["Fonte", p.fonte], ["Executora", p.instituicao], ["Método", p.metodo],
      ["Município", p.municipio + " (" + p.estado + ")"], ["Início", p.data_inicio], ["Área", num(p.area_ha, 2) + " ha"],
      ["Círculo no polígono", Math.round(100 * s.fracao_circulo_no_poligono) + " %"]
    ];
    el("ficha").innerHTML = linhas.map(function (l) { return "<dt>" + l[0] + "</dt><dd>" + esc(l[1]) + "</dd>"; }).join("");
  }

  function preencherRessalvas(j) {
    el("ressalvas").innerHTML = j.ressalvas.map(function (r) { return "<li>" + esc(r) + "</li>"; }).join("");
  }

  function preencherTabela(j) {
    var n = j.ndvi, h = "<thead><tr><th>Ano</th><th>Landsat</th><th>Sensor</th><th>Sentinel-2</th></tr></thead><tbody>";
    for (var i = 0; i < n.anos.length; i++) {
      h += "<tr><td>" + n.anos[i] + "</td><td>" + (n.landsat[i] === null ? "" : num(n.landsat[i], 3)) + "</td><td>" +
        (n.sensor_landsat[i] || "") + "</td><td>" + (n.s2[i] === null ? "" : num(n.s2[i], 3)) + "</td></tr>";
    }
    el("tabela-ndvi").innerHTML = h + "</tbody>";
  }

  function definirAno(ano) {
    ano = +ano; anoAtual = ano;
    el("ano").value = String(ano);
    el("v-ano").textContent = String(ano);
    if (!atual) return;
    var im = atual.imagens.filter(function (x) { return x.ano === ano; })[0];
    el("imagem").src = im.arquivo;
    el("imagem").alt = "Imagem Sentinel-2 em cor verdadeira do polígono " + atual.gid + " em " + ano;
    var dom = atual.agb.anos_dominio.indexOf(ano) >= 0 ? "no domínio do modelo"
      : (atual.agb.anos_sem_predicao.indexOf(ano) >= 0 ? "sem predição" : "fora do domínio do modelo");
    el("legenda-imagem").innerHTML = "Mediana de " + im.n_cenas + " cena" + (im.n_cenas > 1 ? "s" : "") +
      " de 1/07 a 28/09 de " + ano + ", recorte de " + im.lado_m + " m. " +
      '<span class="chave" style="background:#ffd400"></span>polígono ' +
      '<span class="chave" style="background:#00e5ff"></span>círculo de 60 m do modelo. ' +
      "Ano " + dom + (im.marca !== "ok" ? "; imagem marcada: " + im.marca : "") + ".";
    el("imagem").setAttribute("data-ano", String(ano));
    if (grafico) grafico.setOption({ series: [{ id: "landsat", markLine: marcas(atual) }] });
  }

  // ── gráfico do NDVI ───────────────────────────────────────────────────────
  function marcas(j) {
    return {
      silent: true, symbol: "none", animation: false,
      data: [
        { xAxis: j.projeto.ano_inicio, lineStyle: { color: "#9a968e", type: "dashed", width: 1 },
          label: { formatter: "início", color: "#9a968e", fontSize: 10, position: "insideStartTop" } },
        { xAxis: anoAtual, lineStyle: { color: "#e8e6e1", type: "solid", width: 1 },
          label: { formatter: String(anoAtual), color: "#e8e6e1", fontSize: 10, position: "insideEndBottom" } }
      ]
    };
  }

  function desenharGrafico(j) {
    if (!grafico) grafico = echarts.init(el("ndvi"), null, { renderer: "svg" });
    var n = j.ndvi, ls = [], s2 = [];
    for (var i = 0; i < n.anos.length; i++) {
      ls.push([n.anos[i], n.landsat[i]]);
      s2.push([n.anos[i], n.s2[i]]);
    }
    var tinta = "#e8e6e1", fraca = "#9a968e", linha = "#32363d";
    grafico.setOption({
      animation: false,
      grid: { left: 40, right: 56, top: 30, bottom: 24 },
      legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 3, icon: "rect", textStyle: { color: fraca, fontSize: 11 },
        data: ["Landsat TM/ETM+", "Sentinel-2"] },
      tooltip: { trigger: "axis", axisPointer: { type: "line", lineStyle: { color: fraca } },
        backgroundColor: "#16181c", borderColor: linha, textStyle: { color: tinta, fontSize: 11 },
        formatter: function (ps) {
          var ano = ps[0].value[0], h = "<b>" + ano + "</b>";
          ps.forEach(function (p) {
            if (p.value[1] !== null && p.value[1] !== undefined) h += "<br>" + p.marker + p.seriesName + ": " + num(p.value[1], 3);
          });
          return h;
        } },
      xAxis: { type: "value", min: 2000, max: 2024, interval: 4, axisLabel: { color: fraca, fontSize: 10, formatter: String },
        axisLine: { lineStyle: { color: linha } }, splitLine: { show: false } },
      yAxis: { type: "value", scale: true,
        axisLabel: { color: fraca, fontSize: 10, formatter: function (v) { return num(v, 2); } },
        splitLine: { lineStyle: { color: linha, opacity: 0.6 } } },
      series: [
        { id: "landsat", name: "Landsat TM/ETM+", type: "line", data: ls, connectNulls: false, symbol: "circle", symbolSize: 6,
          lineStyle: { width: 2, color: meta.cores_ndvi.landsat }, itemStyle: { color: meta.cores_ndvi.landsat },
          endLabel: { show: true, formatter: "Landsat", color: fraca, fontSize: 10 }, markLine: marcas(j) },
        { id: "s2", name: "Sentinel-2", type: "line", data: s2, connectNulls: false, symbol: "circle", symbolSize: 6,
          lineStyle: { width: 2, color: meta.cores_ndvi.s2 }, itemStyle: { color: meta.cores_ndvi.s2 },
          endLabel: { show: true, formatter: "S2", color: fraca, fontSize: 10 } }
      ]
    }, true);
  }

  // ── início ────────────────────────────────────────────────────────────────
  var pronto = Promise.all([
    fetch("dados/meta.json").then(function (r) { return r.json(); }),
    fetch("dados/poligonos.geojson").then(function (r) { return r.json(); })
  ]).then(function (res) {
    meta = res[0];
    var geo = res[1];
    bases[meta.mapa_base_padrao].addTo(mapa);
    meta.poligonos.forEach(function (p) { porGid[p.gid] = p; });
    legenda();
    el("marcas-ano").innerHTML = meta.anos_imagens.map(function (a) { return "<span>" + a + "</span>"; }).join("");
    camadaPol = L.geoJSON(geo, {
      style: estiloPol,
      onEachFeature: function (f, l) {
        l.bindTooltip(rotuloMapa(f.properties), { sticky: true });
        l.on("click", function () { abrir(f.properties.gid); });
      }
    }).addTo(mapa);
    camadaPts = L.layerGroup(geo.features.map(function (f) {
      var p = f.properties;
      var m = L.circleMarker([p.ponto[1], p.ponto[0]], Object.assign({ props: p }, estiloPt(p)));
      m.bindTooltip(rotuloMapa(p));
      m.on("click", function () { abrir(p.gid); });
      return m;
    })).addTo(mapa);
    mapa.fitBounds(camadaPol.getBounds(), folgas(30));
  });

  el("seletor").addEventListener("change", function () { if (this.value) abrir(this.value); });
  el("ano").addEventListener("input", function () { definirAno(this.value); });
  el("fechar").addEventListener("click", function () {
    el("detalhe").hidden = true; selecionado = null; atual = null; el("seletor").value = ""; redesenhar();
  });
  function dobrarPainel(recolher) {
    var b = el("dobra");
    b.setAttribute("aria-expanded", String(!recolher));
    el("corpo-painel").hidden = recolher;
    b.textContent = recolher ? "+" : "−";
    b.title = recolher ? "Expandir painel" : "Recolher painel";
  }
  el("dobra").addEventListener("click", function () {
    dobrarPainel(this.getAttribute("aria-expanded") === "true");
  });
  window.addEventListener("resize", function () { if (grafico) grafico.resize(); });

  // gancho para os testes no navegador
  window.araticum = {
    pronto: pronto, abrir: abrir, definirAno: definirAno, mapa: mapa,
    camadas: function () { return { poligonos: camadaPol, pontos: camadaPts }; },
    estado: function () { return { gid: atual ? atual.gid : null, ano: anoAtual }; },
    grafico: function () { return grafico; }
  };
})();
