import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isYouTubeSource,extractorArgs,canStartDownload} from '../lib.mjs';

test('configuración de YouTube se aplica a enlaces y búsquedas, sin afectar redes sociales',()=>{
  for(const url of ['https://www.youtube.com/watch?v=DKmGcWlfv4I','https://youtu.be/DKmGcWlfv4I','https://music.youtube.com/watch?v=DKmGcWlfv4I','ytsearch20:tráilers']) {
    assert(isYouTubeSource(url));
    const args=extractorArgs(url);
    assert(args.includes('youtube:player_client=web_embedded,web_safari'));
    assert(args.includes('--sleep-requests'));
    assert(!args.includes('--cookies-from-browser'));
  }
  for(const url of ['https://www.instagram.com/p/De5DCGlobfY/','https://www.tiktok.com/@user/video/123','https://youtube.com.evil.example/video','https://example.org/?site=youtube.com',null]) {
    assert.equal(isYouTubeSource(url),false);assert.deepEqual(extractorArgs(url),[]);
  }
});

test('cola deja un YouTube a la vez y aprovecha espacios para otras fuentes',()=>{
  const yt={url:'https://www.youtube.com/watch?v=DKmGcWlfv4I'},ig={url:'https://www.instagram.com/p/De5DCGlobfY/'};
  assert(canStartDownload(yt,[],3));
  assert.equal(canStartDownload(yt,[yt],3),false);
  assert(canStartDownload(ig,[yt],3));
  assert(canStartDownload(yt,[ig],3));
  assert.equal(canStartDownload(ig,[yt,ig,ig],3),false);
  assert.equal(canStartDownload(yt,[ig],1),false);
});
