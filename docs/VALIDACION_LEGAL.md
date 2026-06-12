# Validación legal de la jornada — checklist para el asesor laboral panameño

> **Para qué es esto.** El motor de jornada de GestorPro implementa las reglas
> laborales como una **interpretación general, NO asesoría legal**. Antes de
> poner la asistencia en producción, un asesor laboral panameño debe validar (o
> corregir) los parámetros y criterios de abajo. Este documento es la lista de
> trabajo: cada punto cita el valor actual, dónde vive en el código y la
> pregunta concreta a confirmar. Es el **gate bloqueante de P2** en
> `DESPLIEGUE.md`; la asistencia no sale a producción sin esta validación.
>
> Todos los valores legales son FIJOS por diseño (no configurables): no existe
> ninguna opción que permita pagar por debajo del mínimo. Cambiar un parámetro
> validado es editar UNA constante en `backend/src/asistencia/jornada/legal.ts`
> y recalcular las jornadas afectadas; no hay valores legales esparcidos.

## Resumen de parámetros

| # | Parámetro | Valor actual | Ubicación |
|---|-----------|--------------|-----------|
| 1 | Divisor del valor-hora | salario mensual ÷ **240** | `legal.ts:41` |
| 2 | Recargo extra diurna | **25 %** | `legal.ts:24` |
| 3 | Recargo extra nocturna | **50 %** | `legal.ts:25` |
| 4 | Recargo extra mixta | **75 %** | `legal.ts:26` |
| 5 | Recargo extra festivo | **150 %** | `legal.ts:27` |
| 6 | Franja nocturna | **18:00–06:00** | `legal.ts:13` |
| 7 | Jornada legal diurna | **8 h** | `legal.ts:17` |
| 8 | Jornada legal nocturna | **7 h** | `legal.ts:18` |
| 9 | Jornada legal mixta | **7.5 h** | `legal.ts:19` |
| 10 | Tope de extra diario | **3 h/día** | `legal.ts:32` |
| 11 | Tope de extra semanal | **9 h/semana** | `legal.ts:33` |

---

## 1. Divisor del valor-hora (240)

- **Cómo se calcula hoy:** `valorHora = salarioMensual ÷ 240`, donde 240 = 30
  días × 8 h (`legal.ts:41,54-56`). Asume que el salario registrado del empleado
  es **mensual**.
- **A confirmar:** ¿es 240 el divisor correcto en Panamá para derivar el
  valor-hora a partir del salario mensual? Si la base legal es otra (p. ej. un
  divisor distinto, o el salario se entiende quincenal), indicar el número.

## 2–5. Recargos de hora extra (25 / 50 / 75 / 150 %)

- **Cómo se aplican hoy:** sobre la hora ordinaria, según la clasificación de la
  jornada — diurna 25 %, nocturna 50 %, mixta 75 %, y **150 % si el día es
  festivo** (`legal.ts:23-28,46-51`).
- **A confirmar:** ¿son correctos los cuatro porcentajes? ¿La clasificación que
  los dispara (diurna/nocturna/mixta) coincide con la del Código de Trabajo?

## 6. Franja nocturna (18:00–06:00)

- **Cómo se aplica hoy:** todo minuto trabajado cuya hora local esté entre las
  18:00 y las 06:00 cuenta como nocturno (`legal.ts:13`, `legal.ts:63-74`). La
  clasificación de la jornada se decide por cuántos minutos trabajados caen en
  esa franja: **0 → diurna; todos → nocturna; una parte → mixta**
  (`calculo.ts:145-148`).
- **A confirmar:** ¿la franja nocturna legal es exactamente 18:00–06:00?

## 7–9. Jornadas legales máximas (8 / 7 / 7.5 h)

- **Cómo se aplican hoy:** los minutos trabajados hasta la jornada legal de su
  clasificación son **ordinarios**; lo que excede es **extra**
  (`calculo.ts:150-152`). Diurna 8 h, nocturna 7 h, mixta 7.5 h.
- **A confirmar:** ¿son correctas las tres jornadas máximas y su asignación por
  clasificación?

## 10–11. Topes de horas extra (3 h/día, 9 h/semana)

- **Cómo se aplica hoy el tope DIARIO:** la extra solo se paga hasta 3 h/día; si
  un día excede, se paga el tope y se **marca la jornada para revisión del jefe**
  (`topeDiaExcedido`), sin reconocer extra por encima del tope sin revisión
  (`calculo.ts:157-158`).
- **A confirmar (diario):** ¿es correcto el tope de 3 h/día y este tratamiento
  del excedente (pagar hasta el tope + marcar para revisión)?
- **A confirmar (semanal):** el tope de 9 h/semana **está definido pero el
  cálculo diario actual no lo aplica** (no hay acumulación semanal en
  `calculo.ts`; solo se usa el tope diario). Confirmar si el tope semanal debe
  hacerse cumplir y, en ese caso, queda como trabajo de implementación pendiente
  además de la validación.

---

## Observaciones de implementación que el asesor debe conocer

Estos puntos no son parámetros sueltos sino criterios de cálculo que conviene
validar explícitamente:

1. **El monto de la extra es el valor-hora COMPLETO con recargo, no solo el
   recargo.** Se paga `(horas extra) × valorHora × (1 + recargo)`
   (`calculo.ts:162-167`): p. ej. una hora extra diurna se paga al 125 % del
   valor-hora. Confirmar que esto es lo correcto (vs. pagar solo el sobre-recargo
   si el salario mensual ya cubriera esas horas).
2. **En festivo, el recargo del 150 % SUSTITUYE al de la clasificación, no se
   suma.** Una hora extra nocturna en día festivo se paga al 150 %, no al
   150 % + 50 % (`legal.ts:46-51`: `if (esFestivo) return 1.5`). Confirmar si
   festivo y nocturnidad deben acumularse o no.
3. **Segundo efecto del festivo (no trabajar no descuenta):** el salario fijo no
   se ve afectado por no trabajar un festivo; esto es implícito (el motor solo
   calcula extras/horas sobre fichajes, no descuenta el salario base). Confirmar
   que no hace falta nada explícito aquí.
4. **Zona horaria:** la clasificación diurna/nocturna usa la **hora local del
   proceso**; en producción el servidor debe ir en `America/Panama`
   (ya anotado en `DESPLIEGUE.md`). Una zona horaria mal puesta clasificaría mal
   las horas nocturnas.

---

## Cierre del gate

Cuando el asesor confirme o corrija cada punto:

1. Anotar aquí su veredicto por parámetro (OK / nuevo valor) y su nombre/fecha.
2. Aplicar los cambios de valor en `legal.ts` (una constante cada uno) y, si
   procede, implementar el tope semanal.
3. Recalcular las jornadas ya cerradas afectadas (corrección o recálculo).
4. Marcar resuelto el gate de validación legal en `DESPLIEGUE.md` (§8, P2) y en
   `DECISIONES.md` (sección de pre-producción).
