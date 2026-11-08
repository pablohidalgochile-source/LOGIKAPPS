"""Live-side operations. Only call from Live's main thread; no network or shell."""
import hashlib
import json
import math
from pathlib import Path
import re
import time

VERSION = '0.7.1'


class SyncPreflight(ValueError):
    pass
TAG = re.compile(r'\[NHM:([a-f0-9]{32}):([a-z0-9-]+)\]$')


def atomic(path, data):
    path = Path(path);path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.writing')
    temp.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding='utf8')
    temp.replace(path)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()


def tag(project, channel):
    return '[NHM:%s:%s]' % (project, channel)


def owned(song, project):
    found = {}
    for t in song.tracks:
        m = TAG.search(t.name)
        if m and m[1] == project:
            if m[2] in found:
                raise ValueError('Hay pistas vinculadas duplicadas en Live. Revisa sus etiquetas NHM antes de actualizar.')
            found[m[2]] = t
    return found


def notes_of(clip):
    # Native Python API returns MidiNote objects, not the Max dictionary wrapper.
    if hasattr(clip, 'get_all_notes_extended'):
        notes = clip.get_all_notes_extended()
    else:
        low = min(0, float(clip.loop_start), float(getattr(clip, 'start_marker', 0))) - 1
        high = max(float(clip.length), float(clip.loop_end), float(getattr(clip, 'end_marker', 0))) + 1
        notes = clip.get_notes_extended(0, 128, low, high - low)
    return sorted([[int(n.pitch), round(float(n.start_time), 6), round(float(n.duration), 6),
                    round(float(n.velocity), 3), bool(n.mute), round(float(n.probability), 5),
                    round(float(n.velocity_deviation), 3)] for n in notes])


def snapshot(song, project):
    tracks = {}
    for channel, t in owned(song, project).items():
        clips = []
        for c in t.arrangement_clips:
            value = {'name': c.name, 'start': round(c.start_time, 6), 'end': round(c.end_time, 6),
                     'loopStart': round(c.loop_start, 6), 'loopEnd': round(c.loop_end, 6), 'loop': bool(c.looping)}
            if c.is_midi_clip:
                value['notes'] = notes_of(c)
            else:
                value.update(file=str(c.file_path), warp=bool(c.warping),
                             pitch=float(c.pitch_coarse), fine=float(c.pitch_fine), gain=float(c.gain))
            clips.append(value)
        tracks[channel] = {'name': t.name, 'clips': clips}
    cues = sorted([[c.name, round(c.time, 6)] for c in song.cue_points if TAG.search(c.name) and TAG.search(c.name)[1] == project])
    return {'tracks': tracks, 'cues': cues}


def binding_path(set_path, project):
    return Path(set_path).parent / 'Samples' / 'NANOOK' / project / ('binding-' + digest(str(Path(set_path).resolve()))[:16] + '.json')


def put_notes(clip, notes):
    import Live
    for offset in range(0, len(notes), 2000):
        specs = tuple(Live.Clip.MidiNoteSpecification(pitch=int(n['pitch']), start_time=float(n['beat']),
                      duration=float(n['beats']), velocity=float(n['velocity']), mute=False) for n in notes[offset:offset + 2000])
        clip.add_new_notes(specs)


def validate(command, set_path):
    project = command.get('projectId', '')
    if not re.fullmatch('[a-f0-9]{32}', project) or command.get('format') != 'nanook-live-transfer' or command.get('version') != 1:
        raise ValueError('Entrega de NANOOK no válida.')
    if not set_path or Path(set_path).resolve() != Path(command.get('targetPath', '')).resolve():
        raise ValueError('El Set abierto cambió. Actualiza la conexión antes de enviar.')
    base = Path(set_path).resolve().parent / 'Samples' / 'NANOOK' / project
    tracks = command.get('tracks', [])
    if not isinstance(tracks, list) or not tracks or len(tracks) > 125:
        raise ValueError('Entrega vacía o con demasiadas pistas.')
    seen = set();count = 0
    for t in tracks:
        channel = t.get('id', '')
        if not re.fullmatch('[a-z0-9-]{1,32}', channel) or channel in seen or t.get('kind') not in {'midi', 'audio', 'structure'}:
            raise ValueError('Identidad de pista inválida.')
        seen.add(channel)
        if t['kind'] == 'audio':
            for source in t.get('clips',[t]):
                p = Path(source.get('file', '')).resolve()
                if not p.is_relative_to(base) or not p.is_file() or p.suffix.lower() not in {'.wav', '.aif', '.aiff', '.flac', '.mp3', '.m4a', '.aac', '.ogg'}:
                    raise ValueError('Una muestra está fuera de la entrega o ya no existe.')
        for n in t.get('notes', []):
            count += 1
            if type(n.get('pitch')) is not int or not 0 <= n['pitch'] <= 127 or not 0 < n.get('beats', 0) <= 7200 or not 0 <= n.get('beat', -1) <= 7200 or not 1 <= n.get('velocity', 0) <= 127:
                raise ValueError('Nota fuera del intervalo permitido.')
    if count > 100000 or not 40 <= command.get('bpm', 0) <= 240 or not 0 < command.get('lengthBeats', 0) <= 7200:
        raise ValueError('La entrega supera los límites musicales permitidos.')
    sections = command.get('sections', [])
    if not isinstance(sections, list) or not 0 <= len(sections) <= 201:
        raise ValueError('Estructura fuera del intervalo permitido.')
    for s in sections:
        if not isinstance(s.get('name'), str) or len(s['name']) > 100 or not 0 <= s.get('beat', -1) < command['lengthBeats'] or not 0 < s.get('beats', 0) <= command['lengthBeats']:
            raise ValueError('Una sección está fuera de la canción.')


def apply(song, command, session, write_notes=put_notes):
    validate(command, song.file_path)
    if command['targetSession'] != session:
        raise ValueError('La sesión de Ableton cambió. Vuelve a enviar desde la app.')
    if song.is_playing or song.record_mode or song.session_record:
        raise ValueError('Detén la reproducción y la grabación de Live antes de actualizar.')
    if song.is_ableton_link_enabled or song.tempo_follower_enabled:
        raise ValueError('Desactiva Link y Tempo Follower para fijar el tempo compartido antes de enviar.')
    if not command.get('setTempo') and (abs(song.tempo - command['bpm']) > .001 or song.signature_numerator != 4 or song.signature_denominator != 4):
        raise ValueError('Los tempos o compases difieren. Marca aplicar tempo y 4/4, o ajústalos en Live.')
    project = command['projectId'];path = binding_path(song.file_path, project)
    before = snapshot(song, project)
    previous = json.loads(path.read_text()) if path.is_file() else None
    if previous and previous.get('jobId') == command['jobId']:
        return {**previous['result'], 'duplicate': True}
    if previous:
        expected_ids = set(previous.get('trackIds', []))
        if (expected_ids and not expected_ids.issubset(before['tracks'])) or (not expected_ids and len(before['tracks']) < previous['result']['tracks']):
            raise ValueError('Faltan etiquetas NHM o pistas vinculadas. Recupera sus nombres/etiquetas originales o el Set guardado antes de actualizar; no se crearán duplicados.')
        if digest(before) != previous['snapshotHash'] and digest(before) != command.get('acceptedReadHash') and not command.get('replaceLive'):
            return {'state': 'conflict', 'error': 'Los clips o marcadores vinculados cambiaron en Live. Puedes conservarlos o elegir reemplazarlos explícitamente.'}
    elif before['tracks']:
        raise ValueError('Este Set contiene pistas NHM sin su vínculo de entrega. Recupera el archivo binding del proyecto original antes de actualizar; no se duplicaron pistas.')
    owned_tracks = owned(song, project)
    # Validate every target before the first mutation.
    for t in owned_tracks.values():
        if t.is_frozen:
            raise ValueError('Descongela las pistas NHM antes de actualizar.')
    marker_tag = tag(project, 'cue')
    old_position = song.current_song_time
    started = False
    try:
        song.begin_undo_step();started = True
        if command.get('setTempo'):
            song.tempo = command['bpm'];song.signature_numerator = 4;song.signature_denominator = 4
        # Only linked arrangement clips are replaced. Devices, faders and other tracks stay owned by the producer.
        for t in owned_tracks.values():
            for c in tuple(t.arrangement_clips):
                t.delete_clip(c)
        cue_actions = [{'op': 'delete', 'beat': c.time} for c in song.cue_points if c.name.endswith(marker_tag)]
        for channel in command['tracks']:
            t = owned_tracks.get(channel['id']);fresh = t is None
            if fresh:
                if channel['kind'] == 'audio':song.create_audio_track(-1)
                else:song.create_midi_track(-1)
                t = song.tracks[-1];owned_tracks[channel['id']] = t
                t.mute = bool(channel.get('muted', False))
            t.name = channel['name'][:100] + ' ' + tag(project, channel['id'])
            t.color = 0xEDB284 if channel['kind'] == 'midi' else 0xC5A6E3 if channel['kind'] == 'structure' else 0x709B86
            if channel['kind'] == 'audio':
                t.create_audio_clip(channel['file'], 0)
                clip = t.arrangement_clips[-1];clip.name = channel['name'];clip.warping = False;clip.looping = False
            elif channel['kind'] == 'midi':
                t.create_midi_clip(0, command['lengthBeats'])
                clip = t.arrangement_clips[-1];clip.name = channel['name'];clip.looping = False
                write_notes(clip, channel['notes'])
            else:
                for section in command['sections']:
                    t.create_midi_clip(section['beat'], section['beats'])
                    clip = t.arrangement_clips[-1];clip.name = section['name'];clip.looping = False
        song.end_undo_step();started = False
        # Native cursor/locator/warp changes may be deferred. Advance between Live timer ticks.
        cue_actions += [{'op': 'add', 'beat': s['beat'], 'name': s['name']} for s in command['sections']]
        return {'state': 'locators', 'skippedCueCollisions': 0, 'cueActions': cue_actions,
                'cueIndex': 0, 'cuePhase': 'position', 'restorePosition': old_position, 'phaseAt': time.time()}
    except Exception as error:
        if started:
            song.current_song_time = old_position;song.end_undo_step()
        # Never pretend a private/native operation was transactional if it failed midway.
        raise ValueError('No se completó la entrega: %s Revisa Live; puedes usar Deshacer antes de reintentar.' % str(error))


def cue_step(song, command, job, session):
    if song.file_path != command['targetPath'] or session != command['targetSession']:
        raise ValueError('Cambió el Set o la conexión durante la entrega. Revisa Live antes de reintentar.')
    if song.is_playing or song.record_mode or song.session_record:
        raise ValueError('Live comenzó a reproducir o grabar durante la entrega. Detén Live y revisa la estructura antes de reintentar.')
    if job.get('audioPending'):
        audio_step(song,command,job);return
    if job['cueIndex'] >= len(job['cueActions']):
        song.current_song_time = job['restorePosition'];job['state'] = 'verifying-sync' if command.get('action') == 'sync-music' else 'verifying';return
    action = job['cueActions'][job['cueIndex']];phase = job['cuePhase'];position = action['beat']
    marker = tag(command['projectId'], 'cue')
    def advance():
        job.update(cueIndex=job['cueIndex'] + 1, cuePhase='position', phaseAt=time.time())
    cue = next((c for c in song.cue_points if abs(c.time - position) < .0001), None)
    if time.time() - job['phaseAt'] > 8:
        raise ValueError('Live no confirmó un marcador a tiempo. Revisa la estructura en Live antes de actualizar.')
    if phase == 'position':
        song.current_song_time = position;job.update(cuePhase='toggle', phaseAt=time.time());return
    if phase == 'toggle':
        if abs(song.current_song_time - position) > .0001:return
        if action['op'] == 'delete':
            if cue and cue.name.endswith(marker):
                song.set_or_delete_cue();job.update(cuePhase='deleted', phaseAt=time.time())
            else:advance()
        elif cue:
            if cue.name.endswith(marker):cue.name = action['name'] + ' ' + marker
            else:job['skippedCueCollisions'] += 1
            advance()
        else:
            song.set_or_delete_cue();job.update(cuePhase='label', phaseAt=time.time())
    elif phase == 'label' and cue:
        cue.name = action['name'] + ' ' + marker;advance()
    elif phase == 'deleted' and not cue:
        advance()


def finish(song, command, provisional):
    if str(song.file_path) != command['targetPath']:
        raise ValueError('Cambió el Set antes de comprobar el resultado. Revisa la entrega en Live.')
    project = command['projectId'];after = snapshot(song, project)
    for t in command['tracks']:
        actual = after['tracks'].get(t['id'], {}).get('clips', [])
        if t['kind'] == 'midi':
            expected = sorted([[n['pitch'], round(n['beat'], 6), round(n['beats'], 6), round(n['velocity'], 3), False] for n in t['notes']])
            native = [n[:5] for n in actual[0].get('notes', [])] if len(actual) == 1 else []
            equal = len(native) == len(expected) and all(a[0] == b[0] and a[4] == b[4] and all(abs(a[i] - b[i]) < .0001 for i in (1, 2, 3)) for a,b in zip(native, expected))
            if len(actual) != 1 or not equal:
                raise ValueError('Las notas recibidas por Live no coinciden con la entrega. Revisa o deshaz la operación en Live.')
        elif t['kind'] == 'audio':
            if len(actual) != 1 or Path(actual[0]['file']).resolve() != Path(t['file']).resolve() or actual[0]['warp']:
                raise ValueError('Live no confirmó una muestra sin Warp. Revisa sus clips antes de reintentar.')
        elif len(actual) != len(command['sections']):
            raise ValueError('Live no confirmó todos los clips de estructura.')
    result = {'state': 'complete', 'tracks': len(command['tracks']),
              'midiNotes': sum(len(t.get('notes', [])) for t in command['tracks']),
              'audioClips': sum(t['kind'] == 'audio' for t in command['tracks']),
              'sections': len(command['sections']), 'skippedCueCollisions': provisional.get('skippedCueCollisions', 0),
              'tempo': song.tempo, 'setName': song.name, 'snapshotHash': digest(after),
              'sourceRevision': command['sourceRevision'], 'jobId': command['jobId']}
    atomic(binding_path(song.file_path, project), {'projectId': project, 'jobId': command['jobId'], 'snapshotHash': digest(after),
           'sourceHash': command['sourceHash'], 'trackIds': list(after['tracks']), 'audioHash': audio_hash(after),
           'liveNoteHashes': music_hashes(song, project), 'updatedAt': time.time(), 'result': result})
    path=binding_path(song.file_path,project);binding=json.loads(path.read_text())
    binding['liveStructures']=read_song(song,read_command(song,project,command['targetSession']),command['targetSession'])['structures'];atomic(path,binding)
    return result


def audio_hash(view):
    return digest({k: v for k, v in view['tracks'].items() if k.startswith('a-')})


def clean_name(name):
    return TAG.sub('', name).strip()


def has_groove(clip):
    value = getattr(clip, 'has_groove', False)
    return bool(value() if callable(value) else value)


def music_hashes(song, project):
    hashes = {}
    for channel, track in owned(song, project).items():
        if channel.startswith('m-'):
            notes = [n for clip in track.arrangement_clips for n in flattened_notes(clip, set())]
            hashes[channel] = digest(sorted([[n['pitch'], round(n['beat'],4), round(n['beats'],4), n['velocity']] for n in notes]))
    return hashes


def flattened_notes(clip, warnings):
    """Read audible note events into Arrangement beats, retaining simultaneous notes."""
    start, end = float(clip.start_time), float(clip.end_time)
    if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
        raise ValueError('Hay un clip MIDI con tiempos inválidos o anteriores al inicio del Arrangement.')
    if bool(getattr(clip, 'muted', False)):
        warnings.add('Se omitieron clips MIDI desactivados; el mute de pista no excluye sus notas de la partitura.')
        return []
    if has_groove(clip):
        warnings.add('Se reciben las posiciones escritas de las notas; el groove de Live no se imprime en los tiempos.')
    raw = notes_of(clip)
    if len(raw) > 100000:raise ValueError('El clip supera 100.000 notas.')
    marker = float(getattr(clip, 'start_marker', clip.loop_start))
    segments = []
    if clip.looping:
        left, right = float(clip.loop_start), float(clip.loop_end)
        if not all(math.isfinite(x) for x in (marker, left, right)) or right <= left:
            raise ValueError('Un bucle MIDI no tiene límites válidos.')
        if any(not n[4] and left <= n[1] < right and n[1] + n[2] > right + .0001 for n in raw):
            raise ValueError('Una nota atraviesa el límite de un bucle. Consolida ese clip en Live antes de recibir para conservar su duración.')
        if marker >= right:marker = left + (marker - left) % (right - left)
        cursor = start
        while cursor < end - .000001:
            length = min(right - marker, end - cursor)
            if length <= .000001 or len(segments) >= 100000:
                raise ValueError('El bucle produciría demasiadas repeticiones.')
            segments.append((marker, marker + length, cursor));cursor += length;marker = left
        warnings.add('Los bucles MIDI se expanden a notas en el Arrangement; Live conserva sus clips originales.')
    else:
        right = min(marker + end - start, float(getattr(clip, 'end_marker', marker + end - start)))
        segments.append((marker, right, start))
    output = []
    for left, right, cursor in segments:
        for pitch, at, length, velocity, mute, probability, deviation in raw:
            if mute or probability == 0 or velocity == 0:
                warnings.add('Se omitieron notas desactivadas, con probabilidad cero o velocidad cero.');continue
            if probability != 1 or deviation != 0:
                warnings.add('Probabilidad y variación de velocidad se reducen a la nota y velocidad nominales; no se recrea su comportamiento aleatorio.')
            a, b = max(left, at), min(right, at + length)
            if b > a + .000001:
                output.append({'pitch': pitch, 'beat': cursor + a - left, 'beats': b - a,
                               'velocity': max(1, min(127, round(velocity)))})
                if len(output) > 100000:raise ValueError('La expansión supera 100.000 notas.')
    return output


def read_command(song, project, session):
    return {'format':'nanook-live-read', 'projectId':project, 'targetPath':song.file_path,
            'targetSession':session, 'projectBpm':float(song.tempo)}


def gain_db(clip):
    display=str(getattr(clip,'gain_display_string','')).replace('−','-').replace(',','.')
    if 'inf' in display.lower():return -120.0
    match=re.search(r'[-+]?\d+(?:\.\d+)?',display)
    if not match:raise SyncPreflight('Live no permite comprobar el nivel de un clip de audio.')
    return round(float(match[0]),1)


def audio_capture(song, project):
    output=[]
    for channel,track in owned(song,project).items():
        if not channel.startswith('a-'):continue
        item={'id':channel,'name':clean_name(track.name),'clips':[]}
        for clip in sorted(track.arrangement_clips,key=lambda c:c.start_time):
            if clip.is_midi_clip:raise ValueError('Una pista de audio vinculada contiene MIDI.')
            file=Path(clip.file_path);stat=file.stat()
            item['clips'].append({'file':str(file),'fileStamp':[stat.st_size,stat.st_mtime_ns,stat.st_ctime_ns],
                'name':clip.name[:100] or item['name'],'start':float(clip.start_time)*60/song.tempo,
                'duration':float(clip.end_time-clip.start_time)*60/song.tempo,'offset':float(clip.loop_start),
                'gainDb':gain_db(clip),'pitch':int(clip.pitch_coarse),'fine':float(clip.pitch_fine),
                'muted':bool(getattr(clip,'muted',False)),'warp':bool(clip.warping),'loop':bool(clip.looping),
                'envelopes':bool(getattr(clip,'has_envelopes',False))})
        output.append(item)
    return output


def read_song(song, command, session):
    """Read-only musical capture. Never edits notes, clips, transport or devices."""
    project = command.get('projectId', '')
    if not re.fullmatch('[a-f0-9]{32}', project) or command.get('format') != 'nanook-live-read':
        raise ValueError('Solicitud de lectura inválida.')
    if song.file_path != command.get('targetPath') or session != command.get('targetSession'):
        raise ValueError('El Set o la conexión cambiaron. Vuelve a leer desde NANOOK.')
    if song.is_playing or song.record_mode or song.session_record:
        raise ValueError('Detén la reproducción y la grabación de Live antes de leer.')
    if song.signature_numerator != 4 or song.signature_denominator != 4:
        raise ValueError('La partitura actual requiere 4/4. Cambia el compás en Live antes de recibir.')
    tempo_parameter = getattr(getattr(getattr(song, 'master_track', None), 'mixer_device', None), 'song_tempo', None)
    if tempo_parameter is None:
        raise ValueError('Live no permite comprobar la automatización de tempo en este Set; no se convirtió el tiempo a segundos.')
    if int(tempo_parameter.automation_state) != 0:
        raise ValueError('El tempo tiene automatización. Esta versión recibe tempo constante; desactiva esa automatización antes de leer.')
    bpm = float(song.tempo)
    if abs(bpm - command['projectBpm']) > .001:
        raise ValueError('Los tempos de Live y NANOOK difieren. Iguala sus BPM antes de recibir notas y estructura.')
    path = binding_path(song.file_path, project)
    if not path.is_file():raise ValueError('Este Set no tiene el vínculo de la canción seleccionada.')
    binding = json.loads(path.read_text());tracks = owned(song, project);view = snapshot(song, project)
    expected = set(binding.get('trackIds', view['tracks']))
    if not expected.issubset(tracks):
        raise ValueError('Faltan pistas o etiquetas NHM. Recupera las etiquetas antes de leer; no se interpretaron como notas borradas.')
    # Upgrade legacy binding metadata only when its saved snapshot still matches exactly.
    if ('audioHash' not in binding or 'liveNoteHashes' not in binding) and digest(view) == binding['snapshotHash']:
        binding.update(audioHash=audio_hash(view), liveNoteHashes=music_hashes(song,project));atomic(path, binding)
    warnings = set();parts = [];rich = {};end = 0;count = 0
    for channel, track in tracks.items():
        if not channel.startswith('m-'):continue
        arranged = [];rich[channel] = []
        for clip in track.arrangement_clips:
            if not clip.is_midi_clip:raise ValueError('Una pista MIDI vinculada contiene un clip incompatible.')
            end = max(end, float(clip.end_time))
            arranged.extend(flattened_notes(clip, warnings))
            rich[channel].append({'start': clip.start_time, 'end': clip.end_time,
                'startMarker': float(getattr(clip, 'start_marker', clip.loop_start)),
                'endMarker': float(getattr(clip, 'end_marker', clip.loop_end)),
                'loopStart': clip.loop_start, 'loopEnd': clip.loop_end, 'loop': bool(clip.looping),
                'muted': bool(getattr(clip, 'muted', False)), 'groove': has_groove(clip)})
        count += len(arranged)
        if count > 100000:raise ValueError('La captura supera 100.000 notas.')
        parts.append({'id': channel, 'liveName': clean_name(track.name), 'notes': sorted(arranged, key=lambda n:(n['beat'],n['pitch'],n['beats']))})
    structure = tracks.get('structure')
    if structure is None:raise ValueError('Falta la pista de estructura vinculada.')
    clips = []
    for clip in structure.arrangement_clips:
        if clip.end_time <= clip.start_time:raise ValueError('Hay una sección sin duración.')
        end = max(end, float(clip.end_time))
        clips.append({'name': clean_name(clip.name)[:100] or 'Sección', 'beat': float(clip.start_time), 'beats': float(clip.end_time - clip.start_time)})
    clips.sort(key=lambda s:s['beat'])
    if any(a['beat']+a['beats'] > b['beat']+.0001 for a,b in zip(clips,clips[1:])):
        raise ValueError('Hay clips de estructura superpuestos. Sepáralos antes de recibir.')
    if len(clips)>200:raise ValueError('La estructura supera 200 secciones.')
    # Audio is not returned; its extent keeps MIDI aligned with the retained reference.
    for t in tracks.values():
        for c in t.arrangement_clips:end = max(end, float(c.end_time))
    points = sorted([{'name': clean_name(c.name)[:100] or 'Sección', 'beat': float(c.time)} for c in song.cue_points],key=lambda s:s['beat'])
    locators = [{'name': c['name'], 'beat': c['beat'],
                 'beats': (points[i+1]['beat'] if i+1<len(points) else max(end,c['beat']+4))-c['beat']}
                for i,c in enumerate(points)]
    if len(parts)>24 or end*60/command['projectBpm']>1800.001:
        raise ValueError('El arreglo vinculado supera 24 partes o 30 minutos.')
    audio_changed = binding.get('audioHash') != audio_hash(view)
    audio=audio_capture(song,project)
    data = {'projectId': project, 'bpm': bpm, 'setName': song.name, 'setPath': song.file_path,
        'parts': parts, 'audio':audio, 'structures': {'clips': clips, 'locators': locators}, 'lengthBeats': end,
        'snapshotHash': digest(view), 'warnings': sorted(warnings), 'audioChanged': audio_changed,
        'binding': {'jobId': binding['jobId'], 'sourceRevision': binding['result']['sourceRevision'],
                    'liveNoteHashes': binding.get('liveNoteHashes', {}), 'liveStructures': binding.get('liveStructures')}}
    data['captureHash'] = digest({'view':view,'rich':rich,'tempo':bpm,'structures':data['structures'],'audio':audio})
    return data


def set_gain_db(clip, target):
    if abs(gain_db(clip)-target)<.051:return
    if target<=-120:clip.gain=0;return
    low,high=0.,1.;best=(float('inf'),float(clip.gain))
    clip.gain=high
    while gain_db(clip)<target-.051 and high<15.8489319246:
        high=min(15.8489319246,high*2);clip.gain=high
    # The native normalized fader curve is private; compare Live's own dB readback.
    for _ in range(16):
        mid=(low+high)/2;clip.gain=mid;actual=gain_db(clip)
        if abs(actual-target)<best[0]:best=(abs(actual-target),mid)
        if abs(actual-target)<.051:break
        if actual<target:low=mid
        else:high=mid
    clip.gain=best[1]
    if best[0]>.11:raise ValueError('Live no confirmó el nivel solicitado para el clip.')


def configure_audio(clip, target):
    if clip.warping or clip.looping:raise ValueError('Live no confirmó el audio sin Warp y sin bucle.')
    clip.pitch_coarse=int(target['pitch']);clip.pitch_fine=float(target['fine'])
    start=target['offset'];end=start+target['duration']*2**((target['pitch']+target['fine']/100)/12)
    # Enlarge the right boundary before moving the left marker, then trim the right.
    if end>clip.loop_end:clip.loop_end=end
    clip.loop_start=start;clip.loop_end=end
    clip.name=target['name'];clip.muted=target['muted'];set_gain_db(clip,target['gainDb'])


def audio_plan(track,target):
    clips=sorted(track.arrangement_clips,key=lambda c:c.start_time) if track else []
    for c in clips:
        if c.warping or c.looping or bool(getattr(c,'has_envelopes',False)) or has_groove(c):
            raise SyncPreflight('Conserva el audio original con Warp, groove o envolventes en Live y consolida una versión sin ellos antes de escribir desde NANOOK.')
    for c in target['clips']:
        for k,lo,hi in [('start',0,1800),('offset',0,1800),('duration',.001,1800),('gainDb',-120,24),('pitch',-48,48),('fine',-50,49)]:
            value=c.get(k)
            if not isinstance(value,(int,float)) or not math.isfinite(value) or not lo<=value<=hi:raise SyncPreflight('Un ajuste de audio está fuera de rango.')
    inplace=len(clips)==len(target['clips']) and all(c.get('reuse')==i and abs(old.start_time*60/target['bpm']-c['start'])<.0001 for i,(old,c) in enumerate(zip(clips,target['clips'])))
    return {'inplace':inplace}


def audio_step(song,command,job):
    tracks=owned(song,command['projectId'])
    if time.time()-job['phaseAt']>8:raise ValueError('Live no confirmó la preparación de audio. Revisa antes de reanudar.')
    for t in command['tracks']:
        if t['kind']!='audio' or t['id'] not in job['audioPending']:continue
        clips=sorted(tracks[t['id']].arrangement_clips,key=lambda c:c.start_time)
        if len(clips)!=len(t['clips']):raise ValueError('Live no confirmó todos los clips de audio.')
        if any(c.warping for c in clips):return
        for c,spec in zip(clips,t['clips']):configure_audio(c,spec)
    job['audioPending']=[]


def untouched(song, project, changed, structure):
    view = snapshot(song, project)
    return digest({'tracks':{k:v for k,v in view['tracks'].items() if k not in changed},
        'markers':{k:[[float(getattr(c,'start_marker',c.loop_start)),float(getattr(c,'end_marker',c.loop_end)),bool(getattr(c,'muted',False)),has_groove(c)] for c in t.arrangement_clips]
                   for k,t in owned(song,project).items() if k not in changed},
        'cues':sorted([[c.name,round(c.time,6)] for c in song.cue_points
                       if not structure or not c.name.endswith(tag(project,'cue'))])})


def note_patch(clip, target):
    """Plan ID-preserving MIDI edits before the first Live mutation."""
    if clip.looping or abs(clip.start_time)>.0001 or abs(float(getattr(clip,'start_marker',0)))>.0001 or bool(getattr(clip,'muted',False)):
        raise SyncPreflight('Para editar esta parte desde NANOOK, consolida su MIDI en un clip que empiece en 1.1.1, sin bucle ni recorte. La versión actual de Live se conserva.')
    if any(n['beat']+n['beats'] > clip.end_time+.0001 for n in target):
        raise SyncPreflight('Hay notas fuera del clip de Live. Amplía ese clip para incluirlas; no se recortó ni sustituyó el arreglo.')
    if not all(hasattr(clip,name) for name in ('get_all_notes_extended','apply_note_modifications','remove_notes_by_id')):
        raise SyncPreflight('Esta versión de Live no ofrece edición MIDI por identificadores para la sincronización automática.')
    native_notes=clip.get_all_notes_extended();notes=list(native_notes);buckets = {}
    for n in notes:
        key=(round(float(n.start_time)*1000),round(float(n.duration)*1000));buckets.setdefault(key,[]).append(n)
    used=set();updates=[];added=[];attempts=0
    for t in target:
        key=(round(t['beat']*1000),round(t['beats']*1000));candidates=[]
        for a in (-1,0,1):
            for b in (-1,0,1):
                for n in buckets.get((key[0]+a,key[1]+b),[]):
                    attempts+=1
                    if attempts>2000000:raise SyncPreflight('Demasiadas notas simultáneas para comparar de forma automática.')
                    if n.note_id not in used and abs(n.start_time-t['beat'])<.0002 and abs(n.duration-t['beats'])<.0002:candidates.append(n)
        n=next((n for n in candidates if n.pitch==t['pitch']),candidates[0] if candidates else None)
        if n is None:added.append(t);continue
        used.add(n.note_id)
        if n.pitch!=t['pitch'] or abs(n.velocity-t['velocity'])>.001:
            updates.append((n,t))
    return updates,[n.note_id for n in notes if n.note_id not in used],added,native_notes


def apply_music(song, command, session, write_notes=put_notes):
    """Automatic optimistic patch; only changed linked components are touched."""
    validate({**command,'format':'nanook-live-transfer'},song.file_path)
    before = read_song(song,read_command(song,command['projectId'],session),session)
    if song.is_ableton_link_enabled or song.tempo_follower_enabled:
        raise SyncPreflight('Desactiva Link y Tempo Follower para mantener el tempo compartido durante la sincronización.')
    if command['targetSession']!=session or abs(before['bpm']-command['bpm'])>.001:
        return {'state':'superseded','error':'La sesión o el tempo cambiaron antes de sincronizar.'}
    path=binding_path(song.file_path,command['projectId']);binding=json.loads(path.read_text())
    if binding['jobId']==command['jobId']:return {**binding['result'],'duplicate':True}
    if before['captureHash']!=command['captureHash']:
        return {'state':'superseded','error':'Live cambió antes de sincronizar; se leerá de nuevo.'}
    tracks=owned(song,command['projectId']);plans={};structure=any(t['kind']=='structure' for t in command['tracks'])
    for t in command['tracks']:
        track=tracks.get(t['id'])
        if track and track.is_frozen:raise SyncPreflight('Descongela la parte vinculada para sincronizar sus notas.')
        if t['kind']=='midi' and track:
            clips=list(track.arrangement_clips)
            if len(clips)>1:raise SyncPreflight('Consolida esta parte MIDI en un clip desde 1.1.1 para editarla desde NANOOK. Sus clips se conservaron.')
            if clips:plans[t['id']]=note_patch(clips[0],t['notes'])
        if t['kind']=='audio':plans[t['id']]=audio_plan(track,{**t,'bpm':command['bpm']})
    changed={t['id'] for t in command['tracks']};guard=untouched(song,command['projectId'],changed,structure)
    # Preserve a portable read of the pre-write music alongside the Live binding.
    atomic(path.parent/'sync-history'/('%s-before.json'%command['jobId']),before)
    position=song.current_song_time;started=False
    try:
        song.begin_undo_step();started=True
        for t in command['tracks']:
            track=tracks.get(t['id'])
            if track is None:
                if t['kind']=='audio':song.create_audio_track(-1)
                else:song.create_midi_track(-1)
                track=song.tracks[-1];tracks[t['id']]=track
                track.name=t['name'][:100]+' '+tag(command['projectId'],t['id']);track.mute=t.get('muted',True)
            if t['kind']=='audio':
                track.name=t['name'][:100]+' '+tag(command['projectId'],t['id'])
                if plans[t['id']]['inplace']:
                    for clip,spec in zip(sorted(track.arrangement_clips,key=lambda c:c.start_time),t['clips']):configure_audio(clip,spec)
                else:
                    for clip in tuple(track.arrangement_clips):track.delete_clip(clip)
                    for c in t['clips']:
                        track.create_audio_clip(c['file'],c['start']*command['bpm']/60)
                        clip=track.arrangement_clips[-1];clip.warping=False;clip.looping=False
            elif t['kind']=='midi':
                if t['id'] in plans:
                    clip=track.arrangement_clips[0];updates,removed,added,native_notes=plans[t['id']]
                    modified=[]
                    for n,target in updates:
                        n.pitch=int(target['pitch']);n.velocity=float(target['velocity']);modified.append(n)
                    # Keep Live's native vector<TNoteInfo>; tuple/list conversion is not accepted.
                    if modified:clip.apply_note_modifications(native_notes)
                    if removed:clip.remove_notes_by_id(removed)
                    if added:write_notes(clip,added)
                else:
                    track.create_midi_clip(0,command['lengthBeats']);clip=track.arrangement_clips[-1]
                    clip.name=t['name'];clip.looping=False;write_notes(clip,t['notes'])
            else:
                for clip in tuple(track.arrangement_clips):track.delete_clip(clip)
                for s in command['sections']:
                    track.create_midi_clip(s['beat'],s['beats']);clip=track.arrangement_clips[-1];clip.name=s['name'];clip.looping=False
        song.end_undo_step();started=False
        marker=tag(command['projectId'],'cue')
        actions=([{'op':'delete','beat':c.time} for c in song.cue_points if c.name.endswith(marker)]+
                 [{'op':'add','beat':s['beat'],'name':s['name']} for s in command['sections']]) if structure else []
        return {'state':'locators','cueActions':actions,'cueIndex':0,'cuePhase':'position','phaseAt':time.time(),
                'restorePosition':position,'untouchedHash':guard,'changedTracks':list(changed),'structurePatched':structure,
                'audioPending':[t['id'] for t in command['tracks'] if t['kind']=='audio' and not plans[t['id']]['inplace']],
                'audioInplace':{t['id']:plans[t['id']]['inplace'] for t in command['tracks'] if t['kind']=='audio'},
                'audioBefore':{t['id']:t['clips'] for t in before['audio']}}
    except Exception as error:
        if started:song.end_undo_step()
        raise ValueError('La sincronización se detuvo tras comenzar una edición. Revisa o deshaz en Live antes de reanudar: '+str(error))


def finish_music(song, command, provisional, session):
    if song.file_path!=command['targetPath'] or session!=command['targetSession'] or song.is_playing or song.record_mode or abs(song.tempo-command['bpm'])>.001:
        raise ValueError('Live cambió de Set, sesión o transporte durante la sincronización. Revisa antes de reanudar.')
    data=read_song(song,read_command(song,command['projectId'],session),session)
    native={p['id']:p['notes'] for p in data['parts']}
    for t in command['tracks']:
        if t['kind']!='midi':continue
        a=sorted([[n['pitch'],n['beat'],n['beats'],n['velocity']] for n in native.get(t['id'],[])])
        b=sorted([[n['pitch'],n['beat'],n['beats'],n['velocity']] for n in t['notes']])
        if len(a)!=len(b) or any(x[0]!=y[0] or any(abs(x[i]-y[i])>.0002 for i in (1,2,3)) for x,y in zip(a,b)):
            raise ValueError('Live no confirmó todas las notas sincronizadas. Revisa antes de reanudar.')
    native_audio={t['id']:t for t in data['audio']}
    for t in command['tracks']:
        if t['kind']!='audio':continue
        actual=native_audio.get(t['id'],{})
        if actual.get('name')!=t['name'] or len(actual.get('clips',[]))!=len(t['clips']):raise ValueError('Live no confirmó la pista de audio sincronizada.')
        for a,b in zip(actual['clips'],t['clips']):
            if a['warp'] or a['loop'] or a['name']!=b['name'] or a['muted']!=b['muted'] or any(abs(a[k]-b[k])>.0011 for k in ('start','offset','duration','pitch','fine')) or abs(a['gainDb']-b['gainDb'])>.11:
                raise ValueError('Live no confirmó el recorte, posición, nivel o transposición de audio.')
            if b.get('reuse') is None or not provisional.get('audioInplace',{}).get(t['id']):
                if Path(a['file']).resolve()!=Path(b['file']).resolve():raise ValueError('Live no confirmó el archivo de audio actualizado.')
            else:
                old=provisional['audioBefore'][t['id']][b['reuse']]
                if a['file']!=old['file'] or a['fileStamp']!=old['fileStamp']:raise ValueError('La muestra cambió durante la escritura de audio.')
    if untouched(song,command['projectId'],set(provisional['changedTracks']),provisional['structurePatched'])!=provisional['untouchedHash']:
        raise ValueError('Otro clip o marcador cambió durante la sincronización. Se requiere revisión.')
    if provisional['structurePatched']:
        actual=data['structures']['clips'];expected=command['sections']
        if len(actual)!=len(expected) or any(a['name']!=b['name'] or abs(a['beat']-b['beat'])>.0002 or abs(a['beats']-b['beats'])>.0002 for a,b in zip(actual,expected)):
            raise ValueError('Live no confirmó la estructura sincronizada.')
    view=snapshot(song,command['projectId'])
    result={'state':'complete','jobId':command['jobId'],'sourceRevision':command['sourceRevision'],
            'midiNotes':sum(len(p['notes']) for p in data['parts']),'sections':len(data['structures']['clips']),
            'snapshotHash':digest(view),'changedParts':len(command['tracks'])}
    atomic(binding_path(song.file_path,command['projectId']),{'projectId':command['projectId'],'jobId':command['jobId'],
        'snapshotHash':digest(view),'sourceHash':command['sourceHash'],'trackIds':list(view['tracks']),
        'audioHash':audio_hash(view),'liveNoteHashes':music_hashes(song,command['projectId']),
        'liveStructures':data['structures'],'updatedAt':time.time(),'result':result})
    return result
