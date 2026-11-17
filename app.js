/* Plataforma Araticum (Etapa 11). Lê os arquivos gerados por scripts/11_web.py.
   AGB como nível do período (D20) e como valor de cada ano no domínio do modelo, sem tendência (D22);
   NDVI Landsat só TM e ETM+ (D21); imagens Landsat de 2000 a 2016 e S2 de 2017 a 2024 (D23). */
(function () {
  "use strict";

  var meta = null, camadaPol = null, camadaPts = null, selecionado = null, grafico = null, graficoAgb = null;
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
      preencherAgb(j); preencherAgbAnual(j); preencherFicha(j); preencherRessalvas(j); preencherTabela(j);
      el("csv").href = j.csv; el("csv").setAttribute("download", "araticum_" + gid + ".csv");
      definirAno(opcoes && opcoes.ano ? opcoes.ano : anoAtual);
      desenharGrafico(j); desenharAgb(j);
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
        "de campo no treino.";
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
    el("imagem").alt = "Imagem " + im.sensor + " em cor verdadeira do polígono " + atual.gid + " em " + ano;
    el("r-imagem").textContent = "Imagem " + im.sensor + ", pixel de " + im.pixel_m + " m";
    var sit = situacaoAno(atual, ano);
    el("legenda-imagem").innerHTML = "Mediana de " + im.n_cenas + " cena" + (im.n_cenas > 1 ? "s" : "") +
      " de 1/07 a 28/09 de " + ano + ", recorte de " + im.lado_m + " m. " +
      '<span class="chave" style="background:#ffd400"></span>polígono ' +
      '<span class="chave" style="background:#00e5ff"></span>círculo de 60 m do modelo. ' +
      (sit === "o modelo não roda" ? "Antes de " + meta.agb_anual.ano_inicio_modelo +
        " o modelo não roda (não há Sentinel-1 nem GEDI)" : "Ano " + sit) +
      (im.marca !== "ok" ? "; imagem marcada: " + im.marca : "") + ".";
    el("imagem").setAttribute("data-ano", String(ano));
    if (grafico) grafico.setOption({ series: [{ id: "landsat", markLine: marcas(atual) }] });
    if (graficoAgb && atual.agb.serie) graficoAgb.setOption({ series: [{ id: "agb", markLine: marcasAgb(atual) }] });
  }

  // situação de um ano no modelo: antes do início do modelo, dentro, sem predição ou fora do domínio
  function situacaoAno(j, ano) {
    if (ano < meta.agb_anual.ano_inicio_modelo) return "o modelo não roda";
    if (j.agb.anos_dominio.indexOf(ano) >= 0) return "no domínio do modelo";
    return j.agb.anos_sem_predicao.indexOf(ano) >= 0 ? "sem predição" : "fora do domínio do modelo";
  }

  // ── AGB de cada ano (D22): só nos anos no domínio do modelo, sem tendência ──
  function preencherAgbAnual(j) {
    var s = j.agb.serie;
    el("g-agb-anual").hidden = !s;
    if (!s) return;
    var h = "<thead><tr><th>Ano</th><th>AGB</th><th>P10</th><th>P90</th></tr></thead><tbody>";
    for (var i = 0; i < s.anos.length; i++) {
      h += "<tr><td>" + s.anos[i] + "</td>" + (s.agb[i] === null
        ? '<td colspan="3">' + situacaoAno(j, s.anos[i]) + "</td>"
        : "<td>" + num(s.agb[i], 1) + "</td><td>" + num(s.p10[i], 1) + "</td><td>" + num(s.p90[i], 1) + "</td>") +
        "</tr>";
    }
    el("tabela-agb").innerHTML = h + "</tbody>";
    var aa = meta.agb_anual, ref = aa.incremento_referencia_t_ha_ano;
    el("agb-aviso").textContent = "Cada ponto é a AGB prevista no ano, com a barra do P10 ao P90, só nos anos no " +
      "domínio do modelo. A variação de um ano para outro não é crescimento: entre anos seguidos, a AGB prevista " +
      "destes polígonos salta até " + num(aa.salto_max_t_ha, 0) + " t/ha, e o cerrado em regeneração cresce de " +
      num(ref[0], 1) + " a " + num(ref[1], 1) + " t/ha por ano. Nos pontos de controle do MapBiomas, a vegetação " +
      "secundária jovem não subiu e o fogo não derrubou a AGB prevista. As linhas pontilhadas são o nível que o " +
      "modelo deu a esses controles.";
  }

  function marcasAgb(j) {
    // linhas dos controles em toda a largura; rótulos na faixa sem modelo, à esquerda, longe dos pontos
    var c = meta.controles_nivel_t_ha, cinza = "#9a968e";
    var refs = [["floresta", c.floresta_estavel, "insideStartTop"], ["savana", c.savana_estavel, "insideStartTop"],
                ["regeneração", c.regeneracao, "insideStartTop"], ["pastagem", c.pastagem_estavel, "insideStartBottom"]];
    var m = marcas(j);
    // antes de 2017 o número do ano cairia sobre os rótulos dos controles; a linha continua, e o ano fica no slider
    if (anoAtual < meta.agb_anual.ano_inicio_modelo) m.data[1].label.show = false;
    m.data = m.data.concat(refs.map(function (r) {
      return [{ coord: [2000, r[1]], lineStyle: { color: cinza, type: "dotted", width: 1, opacity: 0.8 },
                label: { formatter: r[0] + " " + num(r[1], 1), color: cinza, fontSize: 9, position: r[2], distance: 2 } },
              { coord: [2024, r[1]] }];
    }));
    return m;
  }

  function eixoAgb(s) {
    // o topo cobre o maior P90 e a linha de controle mais alta, para as 4 linhas aparecerem em todo polígono
    var c = meta.controles_nivel_t_ha, m = 0, k;
    for (k in c) m = Math.max(m, c[k]);
    for (var i = 0; i < s.anos.length; i++) if (s.p90[i] !== null) m = Math.max(m, s.p90[i]);
    var passos = [10, 20, 25, 40, 50, 100], p = passos[passos.length - 1];
    for (i = 0; i < passos.length; i++) if (m / passos[i] <= 7) { p = passos[i]; break; }
    return { max: Math.ceil(m / p) * p, passo: p };
  }

  function desenharAgb(j) {
    var s = j.agb.serie;
    if (!s) return;
    if (!graficoAgb) graficoAgb = echarts.init(el("agb-grafico"), null, { renderer: "svg" });
    var pts = [], barras = [];
    for (var i = 0; i < s.anos.length; i++) {
      pts.push([s.anos[i], s.agb[i]]);
      if (s.agb[i] !== null) barras.push([s.anos[i], s.p10[i], s.p90[i]]);
    }
    var tinta = "#e8e6e1", fraca = "#9a968e", linha = "#32363d", cor = "#b7d3f6";
    var e = eixoAgb(s);
    graficoAgb.setOption({
      animation: false,
      grid: { left: 40, right: 56, top: 22, bottom: 24 },
      tooltip: { trigger: "item", backgroundColor: "#16181c", borderColor: linha, textStyle: { color: tinta, fontSize: 11 },
        formatter: function (p) {
          var k = s.anos.indexOf(p.value[0]);
          return "<b>" + s.anos[k] + "</b><br>AGB prevista: " + num(s.agb[k], 1) + " t/ha<br>P10 a P90: " +
            num(s.p10[k], 1) + " a " + num(s.p90[k], 1) + " t/ha";
        } },
      xAxis: { type: "value", min: 2000, max: 2024, interval: 4, axisLabel: { color: fraca, fontSize: 10, formatter: String },
        axisLine: { lineStyle: { color: linha } }, splitLine: { show: false } },
      yAxis: { type: "value", min: 0, max: e.max, interval: e.passo,
        axisLabel: { color: fraca, fontSize: 10 }, splitLine: { lineStyle: { color: linha, opacity: 0.6 } } },
      series: [
        { id: "barras", type: "custom", silent: true, data: barras, encode: { x: 0, y: [1, 2] }, z: 1,
          renderItem: function (params, api) {
            var a = api.coord([api.value(0), api.value(1)]), b = api.coord([api.value(0), api.value(2)]), w = 3;
            var st = { stroke: fraca, lineWidth: 1.5 };
            return { type: "group", children: [
              { type: "line", shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: st },
              { type: "line", shape: { x1: a[0] - w, y1: a[1], x2: a[0] + w, y2: a[1] }, style: st },
              { type: "line", shape: { x1: b[0] - w, y1: b[1], x2: b[0] + w, y2: b[1] }, style: st }] };
          } },
        { id: "agb", name: "AGB prevista", type: "line", data: pts, connectNulls: false, symbol: "circle", symbolSize: 7,
          z: 3, lineStyle: { width: 1.5, color: cor }, itemStyle: { color: cor, borderColor: "#16181c", borderWidth: 1.5 },
          markLine: marcasAgb(j),
          markArea: { silent: true, itemStyle: { color: "rgba(154,150,142,0.07)" },
            label: { show: true, position: "top", distance: 4, color: fraca, fontSize: 10,
              formatter: "sem modelo antes de " + meta.agb_anual.ano_inicio_modelo },
            data: [[{ xAxis: 2000 }, { xAxis: meta.agb_anual.ano_inicio_modelo - 0.5 }]] } }
      ]
    }, true);
  }

  // ── gráfico do NDVI ───────────────────────────────────────────────────────
  function marcas(j) {
    return {
      silent: true, symbol: "none", animation: false,
      data: [
        { xAxis: j.projeto.ano_inicio, lineStyle: { color: "#9a968e", type: "dashed", width: 1 },
          label: { formatter: "início", color: "#9a968e", fontSize: 10, position: "insideStartTop" } },
        { xAxis: anoAtual, lineStyle: { color: "#e8e6e1", type: "solid", width: 1 },
          // perto da borda direita, o número do ano fica à esquerda da linha, longe dos rótulos "Landsat" e "S2"
          label: { formatter: String(anoAtual), color: "#e8e6e1", fontSize: 10,
                   position: anoAtual >= 2022 ? "insideEndTop" : "insideEndBottom" } }
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
    afastarRotulos(n);
  }

  function afastarRotulos(n) {
    // quando as duas séries terminam perto, os rótulos "Landsat" e "S2" se separam na vertical
    function ultimo(v) { for (var i = v.length - 1; i >= 0; i--) if (v[i] !== null) return [n.anos[i], v[i]]; return null; }
    var a = ultimo(n.landsat), b = ultimo(n.s2), alt = 13;
    if (!a || !b) return;
    var ya = grafico.convertToPixel({ seriesId: "landsat" }, a)[1], yb = grafico.convertToPixel({ seriesId: "s2" }, b)[1];
    var falta = alt - Math.abs(ya - yb);
    if (falta <= 0) return;
    var s = ya <= yb ? -1 : 1;          // a série que termina mais alta sobe, a outra desce
    grafico.setOption({ series: [{ id: "landsat", endLabel: { offset: [0, s * falta / 2] } },
                                 { id: "s2", endLabel: { offset: [0, -s * falta / 2] } }] });
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
    // slider com os anos das imagens; rótulo em 2000, a cada 5 anos, no início do modelo e no último ano
    var anos = meta.anos_imagens, a0 = anos[0], a1 = anos[anos.length - 1], ini = meta.agb_anual.ano_inicio_modelo;
    el("ano").min = String(a0); el("ano").max = String(a1);
    el("marcas-ano").innerHTML = anos.filter(function (a) {
      return a === a0 || a === a1 || a === ini || (a % 5 === 0 && Math.abs(a - ini) > 2 && a1 - a > 2);
    }).map(function (a) {
      return '<span style="left:calc(8px + (100% - 16px) * ' + ((a - a0) / (a1 - a0)).toFixed(4) + ')">' + a + "</span>";
    }).join("");
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
  window.addEventListener("resize", function () { if (grafico) grafico.resize(); if (graficoAgb) graficoAgb.resize(); });

  // gancho para os testes no navegador
  window.araticum = {
    pronto: pronto, abrir: abrir, definirAno: definirAno, mapa: mapa,
    camadas: function () { return { poligonos: camadaPol, pontos: camadaPts }; },
    estado: function () { return { gid: atual ? atual.gid : null, ano: anoAtual }; },
    grafico: function () { return grafico; },
    graficoAgb: function () { return graficoAgb; }
  };
})();
