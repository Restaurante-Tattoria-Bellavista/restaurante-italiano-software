"""3 pruebas contra la API REAL de Gemini con la clave de backend/.env.

Envian el menu y los dictados de prueba a Google. Se omiten si no hay clave.
Ejecutar solo estas:  pytest tests/test_gemini_live.py -v
"""


def _decir(client, texto, borrador=None):
    r = client.post("/api/v1/voz/interpretar", json={"texto": texto, "borrador": borrador})
    assert r.status_code == 200, r.text
    return r.json()


def test_1_clave_y_modelo_configurados(api_live):
    estado = api_live.get("/api/v1/voz/estado").json()
    assert estado["motor"] == "gemini"
    # Una llamada real: si el modelo no existe o la clave es invalida, cae a reglas.
    r = _decir(api_live, "mesa 1 una pizza margherita")
    assert r["motor"] == "gemini", "Gemini no respondio: revisa GEMINI_MODEL y la clave"


def test_2_entiende_un_pedido_completo(api_live):
    r = _decir(api_live, "Mesa cinco, por favor dos pizzas margherita y una limonada")
    assert r["motor"] == "gemini"
    b = r["borrador"]
    assert b["mesa_numero"] == 5
    assert {(i["nombre"], i["cantidad"]) for i in b["items"]} == {
        ("Pizza Margherita", 2),
        ("Limonata della Casa", 1),
    }
    assert r["pregunta"] is None


def test_3_pregunta_cuando_es_ambiguo_y_confirma_a_cocina(api_live):
    r = _decir(api_live, "mesa 3 quiero un postre")
    assert r["motor"] == "gemini"
    assert r["borrador"]["items"] == [], "No debe inventar cual postre es"
    assert r["pregunta"], "Debe preguntar cual postre"

    r = _decir(api_live, "el tiramisú", r["borrador"])
    assert [i["nombre"] for i in r["borrador"]["items"]] == ["Tiramisu"]

    r = _decir(api_live, "eso es todo", r["borrador"])
    assert r["confirmar"] is True
    pedido = api_live.post("/api/v1/voz/confirmar", json=r["borrador"])
    assert pedido.status_code == 200, pedido.text
    detalle = api_live.get(f"/api/pedidos/{pedido.json()['pedido_id']}").json()
    assert detalle["estado"] == "ABIERTO" and len(detalle["items"]) == 1


def _wav_con_voz(texto):
    """WAV mono 8 kHz 16 bit (igual que el ESP32) con la voz espanola de Windows. None si no hay."""
    import os, subprocess, tempfile
    ruta = os.path.join(tempfile.mkdtemp(), "voz.wav")
    script = (
        "Add-Type -AssemblyName System.Speech;"
        "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
        "$v=$s.GetInstalledVoices()|Where-Object {$_.VoiceInfo.Culture.Name -like 'es*'}|Select-Object -First 1;"
        "if(-not $v){exit 3};$s.SelectVoice($v.VoiceInfo.Name);"
        "$f=New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(8000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono);"
        f"$s.SetOutputToWaveFile('{ruta}',$f);$s.Speak('{texto}');$s.Dispose()"
    )
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return open(ruta, "rb").read() if r.returncode == 0 and os.path.exists(ruta) else None


def test_4_audio_real_voz_a_pedido_en_cocina(api_live):
    import pytest
    primero = _wav_con_voz("Mesa cuatro, dos spaghetti carbonara y una limonada")
    if primero is None:
        pytest.skip("No hay voz en espanol de Windows para generar el audio de prueba")
    r = api_live.post("/api/v1/voz/audio?sesion=prueba", content=primero, headers={"content-type": "audio/wav"})
    assert r.status_code == 200, r.text
    d = r.json()
    print("\ntranscripcion 1:", d["transcripcion"], "->", d["mensaje"])
    assert d["motor"] == "gemini" and d["borrador"]["mesa_numero"] == 4
    assert {(i["nombre"], i["cantidad"]) for i in d["borrador"]["items"]} == {
        ("Spaghetti Carbonara", 2), ("Limonata della Casa", 1)}

    r = api_live.post("/api/v1/voz/audio?sesion=prueba", content=_wav_con_voz("Eso es todo, confirma el pedido"),
                      headers={"content-type": "audio/wav"})
    assert r.status_code == 200, r.text
    print("transcripcion 2:", r.json()["transcripcion"], "->", r.json()["mensaje"])
    assert r.json()["pedido"], "debio crear el pedido"
    cocina = api_live.get("/api/pedidos/cocina").json()
    assert cocina and cocina[0]["mesa_numero"] == 4 and len(cocina[0]["items"]) == 2
