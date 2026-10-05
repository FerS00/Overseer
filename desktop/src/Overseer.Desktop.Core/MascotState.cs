namespace Overseer.Desktop.Core;

public enum MascotState { Idle, Thinking, Reading, Editing, Running, Permission, Done, Error, Sleeping }

public static class MascotLabels
{
    public static string Long(MascotState state) => state switch
    {
        MascotState.Idle => "En espera", MascotState.Thinking => "Pensando", MascotState.Reading => "Leyendo",
        MascotState.Editing => "Editando", MascotState.Running => "Ejecutando", MascotState.Permission => "Pide permiso",
        MascotState.Done => "Terminó", MascotState.Error => "Error", _ => "Durmiendo",
    };

    public static string Short(MascotState state) => state switch
    {
        MascotState.Idle => "REPOSO", MascotState.Thinking => "PIENSA", MascotState.Reading => "LEE",
        MascotState.Editing => "EDITA", MascotState.Running => "EJECUTA", MascotState.Permission => "PERMISO",
        MascotState.Done => "LISTO", MascotState.Error => "ERROR", _ => "DUERME",
    };

    /// <summary>Sub-state labels, same identifiers and texts as <c>frontend/src/app/mascots/activity.ts</c>.</summary>
    public static readonly IReadOnlyDictionary<string, (string Long, string Short)> Activities = new Dictionary<string, (string, string)>
    {
        ["read.file"] = ("Inspeccionando un archivo", "ARCHIVO"), ["read.batch"] = ("Leyendo en lote", "LOTE"),
        ["read.tree"] = ("Recorriendo el árbol", "ÁRBOL"), ["read.web"] = ("Consultando la web", "WEB"),
        ["edit.file"] = ("Editando un archivo", "EDITA"), ["edit.multi"] = ("Editando varios archivos", "MULTI"),
        ["run.shell"] = ("Ejecutando en la shell", "SHELL"), ["run.test"] = ("Ejecutando pruebas", "TESTS"),
        ["run.build"] = ("Compilando", "BUILD"), ["run.install"] = ("Instalando dependencias", "DEPS"),
        ["run.net"] = ("Llamando a una API", "API"), ["run.wait"] = ("Esperando subagentes", "ESPERA"),
    };

    public static readonly IReadOnlyDictionary<string, string> TargetKinds = new Dictionary<string, string>
    {
        ["file"] = "ARCHIVO", ["files"] = "ARCHIVOS", ["tree"] = "ÁRBOL", ["url"] = "URL", ["command"] = "COMANDO", ["agents"] = "SUBAGENTES",
    };
}
