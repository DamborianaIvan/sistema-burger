import { Button, Stack, Typography } from "@mui/material";

export const Paginador = ({ pagina, total, limite, cambiar, ocupado = false }: {
  pagina: number; total: number; limite: number; cambiar: (pagina: number) => void; ocupado?: boolean;
}) => {
  const paginas = Math.max(1, Math.ceil(total / limite));
  return (
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" sx={{ my: 2 }} aria-label="Paginación">
      <Button disabled={ocupado || pagina <= 1} onClick={() => cambiar(pagina - 1)}>Anterior</Button>
      <Typography variant="body2" role="status">Página {pagina} de {paginas} · {total} registros</Typography>
      <Button disabled={ocupado || pagina >= paginas} onClick={() => cambiar(pagina + 1)}>Siguiente</Button>
    </Stack>
  );
};

