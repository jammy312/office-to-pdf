import type { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  return Response.json({message:"james"})
  
}
