import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";

type Channel = {
  id: string;
  name: string;
  orientation: "landscape" | "portrait";
  createdAt: string;
};

@Controller("/channels")
export class ChannelsController {
  private items: Channel[] = [];

  @Get()
  list(@Query("search") search?: string) {
    const s = (search || "").trim().toLowerCase();
    const items = !s ? this.items : this.items.filter(c => c.name.toLowerCase().includes(s));
    return { items };
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    const item = this.items.find(x => x.id === id) ?? null;
    return { item };
  }

  @Post()
  create(@Body() dto: { name: string; orientation: "landscape" | "portrait" }) {
    const item: Channel = {
      id: crypto.randomUUID(),
      name: dto?.name ?? "Untitled",
      orientation: dto?.orientation ?? "landscape",
      createdAt: new Date().toISOString(),
    };
    this.items.unshift(item);
    return { item };
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    this.items = this.items.filter(x => x.id !== id);
    return { ok: true };
  }

  @Post(":id/duplicate")
  duplicate(@Param("id") id: string) {
    const src = this.items.find(x => x.id === id);
    if (!src) return { item: null };

    const copy: Channel = {
      ...src,
      id: crypto.randomUUID(),
      name: `${src.name} (copy)`,
      createdAt: new Date().toISOString(),
    };
    this.items.unshift(copy);
    return { item: copy };
  }
}

