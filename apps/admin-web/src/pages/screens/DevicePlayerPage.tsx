import React from "react";
import { useParams } from "react-router-dom";
import VirtualScreenPage from "../virtual-screen/VirtualScreenPage";

export default function DevicePlayerPage() {
  const { id } = useParams();
  const sessionId = String(id ?? "").trim();

  return <VirtualScreenPage embed sessionId={sessionId} />;
}