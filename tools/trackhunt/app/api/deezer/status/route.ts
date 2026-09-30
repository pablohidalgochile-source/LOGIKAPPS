function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`))?.slice(name.length + 1);
}

export async function GET(request: Request) {
  return Response.json({ connected: Boolean(readCookie(request, "deezer_access")) });
}
