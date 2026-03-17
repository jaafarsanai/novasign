import { Request } from "express";
import { AuthContext } from "./auth-context.interface";
import { JwtPayload } from "./jwt-payload.interface";

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
  user?: JwtPayload;
}