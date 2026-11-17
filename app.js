/* Plataforma Araticum. Lê os arquivos gerados por scripts/11_web.py.
   Lista das áreas no lugar do mapa (D24). Página da área com um gráfico só, de 2000 a 2024, com o NDVI em cima e a
   AGB embaixo, alinhado ao slider (D25); imagem do ano com a área destacada e foto atual da Esri (D26); resumo só
   com números que já existem (D27). AGB como nível do período (D20) e como valor de cada ano no domínio do modelo,
   sem tendência (D22); NDVI Landsat só TM e ETM+ (D21); imagens Landsat de 2000 a 2016 e S2 de 2017 a 2024 (D23). */
(function () {
  "use strict";

  var meta = null, geo = null, porGid = {}, cache = {}, atual = null, anoAtual = null;
  var grafico = null, foto = null, camadaFoto = null, loc = null, pontoLoc = null, tocando = null;
  var ordem = [], rolagemLista = 0, ndviFaixa = [0, 1];
  var ESQ = 40, DIR = 74;                     // margens do gráfico; o trilho do slider usa as mesmas (estilo.css)
  var ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
  var TINTA = "#e8e6e1", FRACA = "#9a968e", LINHA = "#32363d", COR_AGB = "#b7d3f6", FUNDO = "#16181c";
  var CONTROLES = [["pastagem_estavel", "pastagem"], ["regeneracao", "regeneração"], ["savana_estavel", "savana"],
                   ["floresta_estavel", "floresta"]];

  function el(id) { return document.getElementById(id); }
  function num(v, casas) { return v.toFixed(casas).replace(".", ","); }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function lista(v) { return v.length < 2 ? v.join("") : v.slice(0, -1).join(", ") + " e " + v[v.length - 1]; }
  function anos() { return meta.anos_imagens; }
  function a0() { return anos()[0]; }
  function a1() { return anos()[anos().length - 1]; }
  function inicioModelo() { return meta.agb_anual.ano_inicio_modelo; }

  // ── lista das áreas (D24) ─────────────────────────────────────────────────
  function selo(p) {
    if (p.situacao === "nível do período") {
      return '<span class="selo"><i style="background:' + meta.classes[p.classe].cor + '"></i>AGB ' +
        num(p.nivel_t_ha, 1) + " t/ha</span>";
    }
    return '<span class="selo sem"><i></i>AGB não mostrada (' +
      (p.situacao === "fora do domínio do modelo" ? "fora do domínio" : "poucos anos no domínio") + ")</span>";
  }

  function mini(p) {
    // NDVI Landsat de 2000 a 2024 na mesma escala em todos os cartões; tracejado no ano de início
    var w = 180, h = 30, d = "", novo = true;
    var x = function (ano) { return ((ano - a0()) / (a1() - a0()) * w).toFixed(1); };
    var y = function (v) { return (h - 2 - (v - ndviFaixa[0]) / (ndviFaixa[1] - ndviFaixa[0]) * (h - 4)).toFixed(1); };
    p.ndvi_landsat.forEach(function (v, i) {
      if (v === null) { novo = true; return; }
      d += (novo ? "M" : "L") + x(a0() + i) + " " + y(v);
      novo = false;
    });
    return '<svg class="mini" viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<line x1="' + x(p.ano_inicio) + '" x2="' + x(p.ano_inicio) + '" y1="0" y2="' + h + '" stroke="' + FRACA +
      '" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/>' +
      '<path d="' + d + '" fill="none" stroke="' + meta.cores_ndvi.landsat +
      '" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>';
  }

  function cartao(p) {
    return '<a class="cartao" href="#' + p.gid + '">' +
      '<img src="dados/imagens/' + p.gid + "/" + a1() + '.webp" alt="" width="92" height="92" loading="lazy">' +
      '<div><div class="nome">Área ' + p.gid + '</div><div class="info">' + num(p.area_ha, 1) + " ha · início em " +
      p.ano_inicio + "</div>" + selo(p) + mini(p) + '<span class="mini-rot">NDVI de ' + a0() + " a " + a1() +
      "</span></div></a>";
  }

  function filtrados() {
    var mun = el("f-municipio").value, fonte = el("f-fonte").value, so = el("f-agb").checked;
    return meta.poligonos.filter(function (p) {
      return (!mun || p.municipio === mun) && (!fonte || p.fonte === fonte) && (!so || p.situacao === "nível do período");
    });
  }

  function unicos(lista, k) {
    return lista.map(function (p) { return p[k]; }).filter(function (v, i, a) { return a.indexOf(v) === i; })
      .sort(function (x, y) { return x < y ? -1 : x > y ? 1 : 0; });
  }

  function desenharLista() {
    var ps = filtrados(), grupos = {};
    ps.forEach(function (p) { (grupos[p.municipio] = grupos[p.municipio] || []).push(p); });
    var muns = Object.keys(grupos).sort(function (x, y) { return x.localeCompare(y, "pt-BR"); });
    ordem = [];
    el("grupos").innerHTML = muns.map(function (m) {
      var g = grupos[m].sort(function (x, y) { return x.gid - y.gid; });
      g.forEach(function (p) { ordem.push(p.gid); });
      var com = g.filter(function (p) { return p.situacao === "nível do período"; }).length;
      return '<section class="grupo-mun"><h2>' + esc(m) + '</h2><p class="sub">' + unicos(g, "fonte").map(esc).join(", ") +
        " · início em " + unicos(g, "ano_inicio").join(", ") + " · " + g.length + (g.length > 1 ? " áreas" : " área") +
        ", " + com + " com AGB</p>" + '<div class="cartoes">' + g.map(cartao).join("") + "</div></section>";
    }).join("") || '<p class="sub">Nenhuma área com esses filtros.</p>';
    el("conta").textContent = ps.length + " de " + meta.poligonos.length + " áreas";
  }

  // ── navegação entre a lista e a área ──────────────────────────────────────
  function mostrar(qual) {
    if (qual === "area" && !el("lista").hidden) rolagemLista = window.scrollY;
    el("lista").hidden = qual !== "lista";
    el("area").hidden = qual !== "area";
  }

  function rota() {
    var m = location.hash.match(/^#(\d+)(?:\/(\d{4}))?$/);
    if (m && porGid[+m[1]]) return abrir(+m[1], { ano: m[2] ? +m[2] : null });
    return mostrarLista();
  }

  function mostrarLista() {
    parar();
    clearTimeout(tEndereco);
    atual = null;
    mostrar("lista");
    window.scrollTo(0, rolagemLista);
    document.title = "Biomassa no Araticum, Goiás";
    return Promise.resolve(null);
  }

  function carregar(gid) {
    if (cache[gid]) return Promise.resolve(cache[gid]);
    return fetch("dados/poligonos/" + gid + ".json").then(function (r) {
      if (!r.ok) throw new Error("JSON da área " + gid + ": HTTP " + r.status);
      return r.json();
    }).then(function (j) { cache[gid] = j; return j; });
  }

  function carregarGeo() {
    if (geo) return Promise.resolve(geo);
    return fetch("dados/poligonos.geojson").then(function (r) { return r.json(); }).then(function (g) { geo = g; return g; });
  }

  function abrir(gid, opcoes) {
    gid = +gid;
    opcoes = opcoes || {};
    return Promise.all([carregar(gid), carregarGeo()]).then(function (r) {
      var j = r[0], outra = !atual || atual.gid !== gid;
      parar();
      atual = j;
      mostrar("area");
      cabecalho(j); preencherAgb(j); preencherFicha(j); preencherRessalvas(j); preencherTabela(j); vizinhos(gid);
      el("csv").href = j.csv; el("csv").setAttribute("download", "araticum_" + gid + ".csv");
      el("aviso").textContent = aviso(j);
      preCarregar(j);
      desenharGrafico(j);
      definirAno(opcoes.ano || anoAtual || a1());
      desenharFoto(j);
      if (outra) window.scrollTo(0, 0);
      return j;
    });
  }

  function vizinhos(gid) {
    var lista = ordem.indexOf(gid) >= 0 ? ordem : meta.poligonos.map(function (p) { return p.gid; }).sort(function (x, y) { return x - y; });
    var i = lista.indexOf(gid);
    [["anterior", lista[i - 1]], ["proxima", lista[i + 1]]].forEach(function (v) {
      el(v[0]).hidden = v[1] === undefined;
      if (v[1] !== undefined) el(v[0]).href = "#" + v[1];
    });
  }

  function preCarregar(j) {
    j.imagens.forEach(function (im) { var x = new Image(); x.src = im.arquivo; });
  }

  // ── cabeçalho, resumo (D27), ficha, ressalvas e tabela ────────────────────
  function cabecalho(j) {
    var p = j.projeto;
    el("a-titulo").textContent = "Área " + j.gid;
    el("a-sub").innerHTML = esc(p.municipio) + " (" + esc(p.estado) + ") · " + esc(p.fonte) + " · início da restauração em " +
      p.ano_inicio + " · " + num(p.area_ha, 1) + " ha<br>" + esc(p.nome);
    document.title = "Área " + j.gid + " · Biomassa no Araticum";
  }

  function posicaoNosControles(v) {
    var c = meta.controles_nivel_t_ha;
    var refs = CONTROLES.map(function (k) { return [k[1], c[k[0]]]; }).sort(function (x, y) { return x[1] - y[1]; });
    function f(r) { return r[0] + " (" + num(r[1], 1) + " t/ha)"; }
    if (v < refs[0][1]) return "Fica abaixo do que o modelo prevê para " + f(refs[0]);
    for (var i = 0; i < refs.length - 1; i++) {
      if (v < refs[i + 1][1]) return "Fica entre o que o modelo prevê para " + f(refs[i]) + " e para " + f(refs[i + 1]);
    }
    return "Fica acima do que o modelo prevê para " + f(refs[refs.length - 1]);
  }

  function preencherAgb(j) {
    var a = j.agb, aa = meta.agb_anual, ref = aa.incremento_referencia_t_ha_ano, h = "";
    if (a.mostra_nivel) {
      h += '<div class="caixa-res"><span class="rotulo">Biomassa aérea no período</span>' +
        '<div class="num">' + num(a.nivel_t_ha, 1) + "<span> t/ha</span></div>" +
        '<p class="fraco">Mediana da AGB prevista nos ' + a.n_anos_dominio + " anos em que a área ficou no domínio do " +
        "modelo, de " + inicioModelo() + " a " + a1() + ". P10 a P90: " + num(a.p10_t_ha, 1) + " a " + num(a.p90_t_ha, 1) +
        " t/ha, intervalo de referência que cobriu 78 % da AGB de campo no treino.</p>" +
        "<p>" + posicaoNosControles(a.nivel_t_ha) + " nos pontos de controle do MapBiomas.</p></div>";
      h += '<div class="caixa-res"><span class="rotulo">Crescimento da biomassa</span>' +
        "<p>O modelo não consegue medir. Nas áreas com AGB, a previsão muda até " + num(aa.salto_max_t_ha, 0) +
        " t/ha de um ano para o seguinte, e o cerrado em regeneração cresce de " + num(ref[0], 1) + " a " +
        num(ref[1], 1) + " t/ha por ano. Nos pontos de controle, a vegetação secundária jovem não subiu.</p></div>";
    } else {
      h += '<div class="caixa-res sem"><span class="rotulo">Biomassa aérea</span><p>Não mostrada nesta área. ' +
        (a.situacao === "fora do domínio do modelo"
          ? "Em nenhum ano as variáveis de satélite ficam perto das áreas de treino do modelo, e a AGB prevista seria extrapolação."
          : "Só " + a.n_anos_dominio + (a.n_anos_dominio > 1 ? " anos ficaram" : " ano ficou") + " no domínio do modelo, e o nível pede " +
            meta.min_anos_nivel + " ou mais.") + "</p></div>";
      h += '<div class="caixa-res"><span class="rotulo">Crescimento da biomassa</span>' +
        "<p>Sem AGB, a mudança da vegetação aparece no NDVI e nas imagens. Mesmo nas áreas com AGB, o modelo não " +
        "consegue medir o crescimento de um ano para outro.</p></div>";
    }
    h += '<div class="caixa-res"><span class="rotulo">Vegetação (NDVI)</span><p>Para ver a mudança da vegetação, ' +
      "acompanhe o NDVI no gráfico e a imagem de cada ano. A linha tracejada marca o início da restauração, em " +
      j.projeto.ano_inicio + ".</p></div>";
    el("resumo").innerHTML = h;
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

  // situação de um ano no modelo: antes do início do modelo, dentro, sem predição ou fora do domínio
  function situacaoAno(j, ano) {
    if (ano < inicioModelo()) return "o modelo não roda";
    if (j.agb.anos_dominio.indexOf(ano) >= 0) return "no domínio do modelo";
    return j.agb.anos_sem_predicao.indexOf(ano) >= 0 ? "sem predição" : "fora do domínio do modelo";
  }

  // AGB de um ano: o valor (só nos anos no domínio e só nas áreas com nível) ou o motivo de não haver
  function agbDoAno(j, ano) {
    var s = j.agb.serie, k = s ? s.anos.indexOf(ano) : -1;
    if (k >= 0 && s.agb[k] !== null) return { agb: s.agb[k], p10: s.p10[k], p90: s.p90[k] };
    var sit = situacaoAno(j, ano);
    return { motivo: sit === "no domínio do modelo" ? "poucos anos no domínio" : sit };
  }

  function preencherTabela(j) {
    var n = j.ndvi, h = "<thead><tr><th>Ano</th><th>NDVI Landsat</th><th>Sensor</th><th>NDVI S2</th><th>AGB</th>" +
      "<th>P10</th><th>P90</th></tr></thead><tbody>";
    for (var i = 0; i < n.anos.length; i++) {
      var g = agbDoAno(j, n.anos[i]);
      h += "<tr><td>" + n.anos[i] + "</td><td>" + (n.landsat[i] === null ? "" : num(n.landsat[i], 3)) + "</td><td>" +
        (n.sensor_landsat[i] || "") + "</td><td>" + (n.s2[i] === null ? "" : num(n.s2[i], 3)) + "</td>" +
        (g.motivo ? '<td class="sit" colspan="3">' + g.motivo + "</td>"
          : "<td>" + num(g.agb, 1) + "</td><td>" + num(g.p10, 1) + "</td><td>" + num(g.p90, 1) + "</td>") + "</tr>";
    }
    el("tabela").innerHTML = h + "</tbody>";
  }

  function aviso(j) {
    var t = "Em cima, o NDVI no fim da estação seca (1/07 a 28/09): Landsat TM e ETM+ desde " + a0() +
      " e Sentinel-2 desde " + inicioModelo() + ". Embaixo, a AGB que o modelo prevê ";
    t += j.agb.serie
      ? "em cada ano em que a área fica no domínio do modelo, com a barra do P10 ao P90; as linhas pontilhadas são o " +
        "que o modelo prevê para os pontos de controle do MapBiomas (" + lista(CONTROLES.map(function (k) {
          return k[1] + " " + num(meta.controles_nivel_t_ha[k[0]], 1) + " t/ha";
        })) + "). A AGB prevista varia de um ano para outro mais " +
        "do que a vegetação cresce, por isso a diferença entre dois pontos não indica crescimento."
      : "fica vazia, porque nesta área a AGB não é mostrada.";
    return t + " Clique no gráfico ou use o slider para mudar o ano da imagem.";
  }

  // ── ano selecionado ───────────────────────────────────────────────────────
  function definirAno(ano) {
    ano = Math.max(a0(), Math.min(a1(), +ano));
    anoAtual = ano;
    el("ano").value = String(ano);
    el("v-ano").textContent = String(ano);
    if (!atual) return;
    var im = atual.imagens.filter(function (x) { return x.ano === ano; })[0];
    el("imagem").src = im.arquivo;
    el("imagem").alt = "Imagem " + im.sensor + " em cor verdadeira da área " + atual.gid + " em " + ano;
    el("imagem").setAttribute("data-ano", String(ano));
    el("r-imagem").textContent = "Imagem " + im.sensor + ", pixel de " + im.pixel_m + " m";
    var sit = situacaoAno(atual, ano);
    el("legenda-imagem").innerHTML = "Mediana de " + im.n_cenas + " cena" + (im.n_cenas > 1 ? "s" : "") +
      " de 1/07 a 28/09 de " + ano + ", recorte de " + im.lado_m + " m. " +
      '<span class="chave" style="background:#ffd400"></span>área de restauração, ' +
      '<span class="chave" style="background:#00e5ff"></span>círculo de 60 m usado pelo modelo; o entorno fica ' +
      "escurecido. " + (sit === "o modelo não roda" ? "Antes de " + inicioModelo() +
        " o modelo não roda (não há Sentinel-1 nem GEDI)" : "Ano " + sit) +
      (im.marca !== "ok" ? "; imagem marcada: " + im.marca : "") + ".";
    if (grafico) grafico.setOption({ series: [{ id: "landsat", markLine: marcas(atual, true) }, { id: "agb", markLine: marcasAgb(atual) }] });
    marcarEndereco();
  }

  // o ano vai para o endereço (para compartilhar) só quando o slider para: navegadores limitam o replaceState
  var tEndereco = null;
  function marcarEndereco() {
    clearTimeout(tEndereco);
    tEndereco = setTimeout(function () {
      if (!atual) return;
      try { history.replaceState(null, "", "#" + atual.gid + "/" + anoAtual); } catch (e) { /* limite do navegador */ }
    }, 500);
  }

  function tocar() {
    if (tocando) { parar(); return; }
    if (anoAtual >= a1()) definirAno(a0());
    el("b-tocar").textContent = "❚❚ Pausar";
    el("b-tocar").setAttribute("aria-label", "Pausar");
    tocando = setInterval(function () {
      if (anoAtual >= a1()) { parar(); return; }
      definirAno(anoAtual + 1);
    }, 800);
  }

  function parar() {
    if (tocando) clearInterval(tocando);
    tocando = null;
    el("b-tocar").textContent = "▶ Reproduzir";
    el("b-tocar").setAttribute("aria-label", "Reproduzir os anos");
  }

  // ── gráfico único (D25): NDVI em cima, AGB embaixo, mesmo eixo de anos ─────
  function eixoAgb(s) {
    // o topo cobre o maior P90 e o controle mais alto, para as 4 linhas aparecerem em toda área
    var c = meta.controles_nivel_t_ha, m = 0, i;
    CONTROLES.forEach(function (k) { m = Math.max(m, c[k[0]]); });
    if (s) for (i = 0; i < s.anos.length; i++) if (s.p90[i] !== null) m = Math.max(m, s.p90[i]);
    var passos = [10, 20, 25, 40, 50, 100], p = passos[passos.length - 1];
    for (i = 0; i < passos.length; i++) if (m / passos[i] <= 7) { p = passos[i]; break; }
    return { max: Math.ceil(m / p) * p, passo: p };
  }

  function marcas(j, comRotulo) {
    return {
      silent: true, symbol: "none", animation: false,
      data: [
        { xAxis: j.projeto.ano_inicio, lineStyle: { color: FRACA, type: "dashed", width: 1 },
          label: { show: !!comRotulo, formatter: "início", color: FRACA, fontSize: 10, position: "insideEndTop" } },
        { xAxis: anoAtual === null ? a1() : anoAtual, lineStyle: { color: TINTA, type: "solid", width: 1.5 }, label: { show: false } }
      ]
    };
  }

  function marcasAgb(j) {
    var m = marcas(j, false), c = meta.controles_nivel_t_ha;
    if (j.agb.serie) {
      m.data = m.data.concat(CONTROLES.map(function (k) {
        return [{ coord: [inicioModelo() - 0.5, c[k[0]]], lineStyle: { color: FRACA, type: "dotted", width: 1, opacity: 0.9 },
                  label: { show: false } }, { coord: [a1(), c[k[0]]] }];
      }));
    }
    return m;
  }

  function layout() {
    var H = el("grafico").clientHeight, topo = 46, entre = 44, base = 26;
    var h0 = Math.round((H - topo - entre - base) / 2);
    return { topo0: topo, h0: h0, topo1: topo + h0 + entre, h1: H - topo - h0 - entre - base };
  }

  function rotulosControles(s, L, W) {
    // rótulos na margem direita, afastados na vertical quando as linhas ficam perto
    if (!s) return [];
    var c = meta.controles_nivel_t_ha, alt = 14, lim = [L.topo1 + 6, L.topo1 + L.h1 - 6];
    var r = CONTROLES.map(function (k) {
      return { t: k[1], y: grafico.convertToPixel({ yAxisIndex: 1 }, c[k[0]]) };       // os valores ficam no texto abaixo do gráfico
    }).sort(function (x, y) { return y.y - x.y; });            // de baixo para cima
    for (var i = 1; i < r.length; i++) r[i].y = Math.min(r[i].y, r[i - 1].y - alt);
    var falta = lim[0] - r[r.length - 1].y;
    if (falta > 0) r.forEach(function (x) { x.y += falta; });
    return r.map(function (x, i) {
      return { type: "text", id: "ctl" + i, x: W - DIR + 5, y: x.y, silent: true,
        style: { text: x.t, fill: FRACA, font: "9.5px 'IBM Plex Sans', sans-serif", textAlign: "left", textVerticalAlign: "middle" } };
    });
  }

  function textoAno(j, ano) {
    var n = j.ndvi, i = n.anos.indexOf(ano), g = agbDoAno(j, ano), h = "<b>" + ano + "</b>";
    h += "<br>NDVI Landsat: " + (n.landsat[i] === null ? "sem dado" : num(n.landsat[i], 3) + " (" + n.sensor_landsat[i] + ")");
    if (ano >= inicioModelo()) h += "<br>NDVI Sentinel-2: " + (n.s2[i] === null ? "sem dado" : num(n.s2[i], 3));
    h += "<br>AGB: " + (g.motivo ? g.motivo : num(g.agb, 1) + " t/ha (P10 a P90: " + num(g.p10, 1) + " a " + num(g.p90, 1) + ")");
    return h;
  }

  function desenharGrafico(j) {
    var novo = !grafico;
    if (novo) grafico = echarts.init(el("grafico"), null, { renderer: "svg" });
    var n = j.ndvi, s = j.agb.serie, ls = [], s2 = [], pts = [], barras = [], i;
    for (i = 0; i < n.anos.length; i++) { ls.push([n.anos[i], n.landsat[i]]); s2.push([n.anos[i], n.s2[i]]); }
    if (s) {
      for (i = 0; i < s.anos.length; i++) {
        pts.push([s.anos[i], s.agb[i]]);
        if (s.agb[i] !== null) barras.push([s.anos[i], s.p10[i], s.p90[i]]);
      }
    }
    var e = eixoAgb(s), L = layout(), W = el("grafico").clientWidth;
    var eixoX = function (k, rotulos) {
      return { gridIndex: k, type: "value", min: a0(), max: a1(), interval: 4,
        axisLabel: { show: rotulos, color: FRACA, fontSize: 10.5, formatter: String },
        axisLine: { lineStyle: { color: LINHA } }, axisTick: { lineStyle: { color: LINHA } }, splitLine: { show: false },
        axisPointer: { snap: true, label: { show: false } } };
    };
    var titulo = function (id, y, t) {
      return { type: "text", id: id, x: 0, y: y, silent: true,
        style: { text: t, fill: TINTA, font: "600 11.5px 'IBM Plex Sans', sans-serif", textVerticalAlign: "bottom" } };
    };
    var graficos = [titulo("t-ndvi", L.topo0 - 8, "NDVI no fim da estação seca"),
      titulo("t-agb", L.topo1 - 10, "AGB prevista pelo modelo (t/ha)")];
    if (!s) {
      graficos.push({ type: "text", id: "sem-agb", x: ESQ + (W - ESQ - DIR) / 2, y: L.topo1 + L.h1 / 2, silent: true,
        style: { text: "AGB não mostrada nesta área\n(" + (j.agb.situacao === "fora do domínio do modelo"
          ? "fora do domínio do modelo" : "poucos anos no domínio") + ")", fill: FRACA, textAlign: "center",
          textVerticalAlign: "middle", font: "12px 'IBM Plex Sans', sans-serif", lineHeight: 17 } });
    }
    grafico.setOption({
      animation: false,
      grid: [{ left: ESQ, right: DIR, top: L.topo0, height: L.h0 }, { left: ESQ, right: DIR, top: L.topo1, height: L.h1 }],
      legend: { top: 0, right: DIR, itemWidth: 14, itemHeight: 3, icon: "rect", textStyle: { color: FRACA, fontSize: 11 },
        data: ["Landsat TM/ETM+", "Sentinel-2"] },
      axisPointer: { link: [{ xAxisIndex: "all" }], lineStyle: { color: FRACA } },
      tooltip: { trigger: "axis", backgroundColor: FUNDO, borderColor: LINHA, textStyle: { color: TINTA, fontSize: 11.5 },
        formatter: function (ps) { return textoAno(j, Math.round(ps[0].axisValue)); } },
      xAxis: [eixoX(0, false), eixoX(1, true)],
      yAxis: [
        { gridIndex: 0, type: "value", scale: true, splitNumber: 3,
          axisLabel: { color: FRACA, fontSize: 10, formatter: function (v) { return num(v, 2); } },
          splitLine: { lineStyle: { color: LINHA, opacity: 0.6 } } },
        { gridIndex: 1, type: "value", min: 0, max: e.max, interval: e.passo,
          axisLabel: { color: FRACA, fontSize: 10 }, splitLine: { lineStyle: { color: LINHA, opacity: 0.6 } } }
      ],
      graphic: { elements: graficos },
      series: [
        { id: "landsat", name: "Landsat TM/ETM+", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: ls, connectNulls: false,
          symbol: "circle", symbolSize: 5, lineStyle: { width: 2, color: meta.cores_ndvi.landsat },
          itemStyle: { color: meta.cores_ndvi.landsat }, markLine: marcas(j, true) },
        { id: "s2", name: "Sentinel-2", type: "line", xAxisIndex: 0, yAxisIndex: 0, data: s2, connectNulls: false,
          symbol: "circle", symbolSize: 5, lineStyle: { width: 2, color: meta.cores_ndvi.s2 }, itemStyle: { color: meta.cores_ndvi.s2 } },
        { id: "barras", type: "custom", xAxisIndex: 1, yAxisIndex: 1, silent: true, data: barras, encode: { x: 0, y: [1, 2] }, z: 1,
          renderItem: function (params, api) {
            var p = api.coord([api.value(0), api.value(1)]), q = api.coord([api.value(0), api.value(2)]), w = 3;
            var st = { stroke: FRACA, lineWidth: 1.5 };
            return { type: "group", children: [
              { type: "line", shape: { x1: p[0], y1: p[1], x2: q[0], y2: q[1] }, style: st },
              { type: "line", shape: { x1: p[0] - w, y1: p[1], x2: p[0] + w, y2: p[1] }, style: st },
              { type: "line", shape: { x1: q[0] - w, y1: q[1], x2: q[0] + w, y2: q[1] }, style: st }] };
          } },
        { id: "agb", name: "AGB prevista", type: "line", xAxisIndex: 1, yAxisIndex: 1, data: pts, connectNulls: false,
          symbol: "circle", symbolSize: 7, z: 3, lineStyle: { width: 1.5, color: COR_AGB },
          itemStyle: { color: COR_AGB, borderColor: FUNDO, borderWidth: 1.5 }, markLine: marcasAgb(j),
          markArea: { silent: true, itemStyle: { color: "rgba(154,150,142,0.08)" },
            label: { show: !!s, position: "inside", color: FRACA, fontSize: 10.5 },
            data: [[{ xAxis: a0(), name: "sem modelo antes de " + inicioModelo() }, { xAxis: inicioModelo() - 0.5 }]] } }
      ]
    }, true);
    grafico.setOption({ graphic: { elements: rotulosControles(s, L, W) } });
    if (novo) {
      grafico.getZr().on("click", function (ev) {
        var w = el("grafico").clientWidth;
        if (ev.offsetX < ESQ - 6 || ev.offsetX > w - DIR + 6) return;
        definirAno(Math.round(grafico.convertFromPixel({ xAxisIndex: 0 }, ev.offsetX)));
      });
    }
  }

  // ── foto atual da Esri e localização (D26) ────────────────────────────────
  function desenharFoto(j) {
    if (!foto) {
      foto = L.map("foto", { scrollWheelZoom: false, zoomSnap: 0.5 });
      // acima do zoom 17 a Esri não tem foto em parte de Goiás; o 17 é ampliado
      L.tileLayer(ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, maxNativeZoom: 17, attribution: "Esri, Maxar, Earthstar Geographics" }).addTo(foto);
      L.control.scale({ imperial: false, position: "bottomright" }).addTo(foto);
      loc = L.map("localizacao", { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
        doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false }).setView([-15.9, -49.6], 4);
      L.tileLayer(ESRI + "Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(loc);
      L.tileLayer(ESRI + "Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(loc);
      meta.poligonos.forEach(function (p) {
        L.circleMarker([p.ponto[1], p.ponto[0]], { radius: 2, stroke: false, fillColor: FRACA, fillOpacity: 0.9 }).addTo(loc);
      });
      pontoLoc = L.circleMarker([0, 0], { radius: 5, color: "#0d0e11", weight: 1.5, fillColor: "#ffd400", fillOpacity: 1 }).addTo(loc);
    }
    foto.invalidateSize();
    loc.invalidateSize();
    if (camadaFoto) foto.removeLayer(camadaFoto);
    var f = geo.features.filter(function (x) { return x.properties.gid === j.gid; })[0];
    var pol = L.geoJSON(f, { style: { color: "#ffd400", weight: 3, fill: false } });
    var pt = j.suporte.ponto;
    camadaFoto = L.layerGroup([pol, L.circle([pt[1], pt[0]], { radius: j.suporte.raio_m, color: "#00e5ff", weight: 2, fill: false })]).addTo(foto);
    foto.fitBounds(pol.getBounds(), { padding: [36, 36], maxZoom: 18 });
    pontoLoc.setLatLng([pt[1], pt[0]]);
    pontoLoc.bringToFront();
  }

  // ── início ────────────────────────────────────────────────────────────────
  var pronto = fetch("dados/meta.json").then(function (r) { return r.json(); }).then(function (m) {
    meta = m;
    meta.poligonos.forEach(function (p) { porGid[p.gid] = p; });
    var vs = [];
    meta.poligonos.forEach(function (p) { p.ndvi_landsat.forEach(function (v) { if (v !== null) vs.push(v); }); });
    ndviFaixa = [Math.min.apply(null, vs), Math.max.apply(null, vs)];
    el("ano").min = String(a0()); el("ano").max = String(a1());
    el("f-municipio").insertAdjacentHTML("beforeend", unicos(meta.poligonos, "municipio").map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(v) + "</option>";
    }).join(""));
    el("f-fonte").insertAdjacentHTML("beforeend", unicos(meta.poligonos, "fonte").map(function (v) {
      return '<option value="' + esc(v) + '">' + esc(v) + "</option>";
    }).join(""));
    desenharLista();
    return rota();
  });

  ["f-municipio", "f-fonte", "f-agb"].forEach(function (id) { el(id).addEventListener("change", desenharLista); });
  window.addEventListener("hashchange", rota);
  el("ano").addEventListener("input", function () { definirAno(this.value); });
  el("b-anterior").addEventListener("click", function () { parar(); definirAno(anoAtual - 1); });
  el("b-proximo").addEventListener("click", function () { parar(); definirAno(anoAtual + 1); });
  el("b-tocar").addEventListener("click", tocar);
  var largura = window.innerWidth;
  window.addEventListener("resize", function () {
    if (!grafico || !atual) return;
    grafico.resize();
    if (window.innerWidth !== largura) { largura = window.innerWidth; desenharGrafico(atual); definirAno(anoAtual); }
  });

  // gancho para os testes no navegador
  window.araticum = {
    pronto: pronto,
    abrir: function (gid, opcoes) { try { history.replaceState(null, "", "#" + gid); } catch (e) { /* limite */ } return abrir(gid, opcoes); },
    voltar: function () { try { history.replaceState(null, "", location.pathname); } catch (e) { /* limite */ } return mostrarLista(); },
    definirAno: definirAno,
    estado: function () { return { gid: atual ? atual.gid : null, ano: anoAtual, ordem: ordem.slice() }; },
    grafico: function () { return grafico; },
    foto: function () { return foto; }
  };
})();
