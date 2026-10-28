import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    primary: { main: "#C63D13", light: "#F75A21", dark: "#872C18", contrastText: "#FFFFFF" },
    secondary: { main: "#665E57", light: "#948D87", dark: "#29231F", contrastText: "#FFFFFF" },
    success: { main: "#24734D", light: "#EAF5ED", dark: "#165C3B" },
    warning: { main: "#925D12", light: "#FFF2D8", dark: "#75480C" },
    error: { main: "#B5332D", light: "#FFF0ED", dark: "#8F2520" },
    info: { main: "#315F85", light: "#EAF3F8", dark: "#244A68" },
    background: { default: "#FAF7F4", paper: "#FFFFFF" },
    divider: "#E8DED5",
    text: { primary: "#29231F", secondary: "#665E57", disabled: "#948D87" },
  },
  shape: { borderRadius: 12 },
  spacing: 8,
  typography: {
    fontFamily: '"Segoe UI", Inter, system-ui, sans-serif',
    h4: { fontSize: "clamp(1.55rem, 2.4vw, 2rem)", fontWeight: 750, lineHeight: 1.25, letterSpacing: "-.025em" },
    h5: { fontSize: "1.4rem", fontWeight: 700, lineHeight: 1.3 },
    h6: { fontSize: "1.1rem", fontWeight: 700, lineHeight: 1.35 },
    subtitle1: { fontWeight: 650 },
    button: { textTransform: "none", fontWeight: 700, letterSpacing: 0 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 10, minHeight: 40, paddingInline: 16 },
        contained: { boxShadow: "0 3px 9px rgb(135 44 24 / 14%)", "&:hover": { boxShadow: "0 5px 14px rgb(135 44 24 / 20%)" } },
        outlined: { borderColor: "#D8C9BB", "&:hover": { borderColor: "#C63D13", backgroundColor: "#FFF5EF" } },
      },
    },
    MuiCard: { defaultProps: { elevation: 0 }, styleOverrides: { root: { border: "1px solid #E8DED5", borderRadius: 16, boxShadow: "0 3px 16px rgb(76 45 25 / 7%)" } } },
    MuiCardContent: { styleOverrides: { root: { padding: 22, "&:last-child": { paddingBottom: 22 } } } },
    MuiPaper: { styleOverrides: { root: { backgroundImage: "none" }, rounded: { borderRadius: 16 } } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 18, boxShadow: "0 24px 60px rgb(32 22 15 / 20%)" } } },
    MuiDialogTitle: { styleOverrides: { root: { fontWeight: 750, borderBottom: "1px solid #E8DED5", padding: "18px 24px" } } },
    MuiDialogActions: { styleOverrides: { root: { borderTop: "1px solid #E8DED5", padding: "14px 24px", gap: 8 } } },
    MuiTextField: { defaultProps: { variant: "outlined" } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10, backgroundColor: "#FFFFFF", "& .MuiOutlinedInput-notchedOutline": { borderColor: "#D8C9BB" }, "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "#C63D13" } } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8, fontWeight: 650 }, colorDefault: { backgroundColor: "#F5EFE9", color: "#665E57" } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12, alignItems: "center" } } },
    MuiTooltip: { styleOverrides: { tooltip: { borderRadius: 8, fontSize: ".8rem" } } },
    MuiTableCell: { styleOverrides: { root: { borderBottomColor: "#E8DED5", padding: "12px 16px" }, head: { backgroundColor: "#F5EFE9", color: "#665E57", fontWeight: 750 } } },
    MuiIconButton: { styleOverrides: { root: { borderRadius: 10 } } },
    MuiBadge: { styleOverrides: { badge: { fontWeight: 700 } } },
  },
});

