                    entry.nomeTiny
                      ? str(
                          entry.nomeTiny
                        )
                      : undefined,

                  isNew:
                    Boolean(
                      entry.isNew
                    ),

                  matchMethod:
                    entry.matchMethod ===
                        "redis" ||
                    entry.matchMethod ===
                        "id" ||
                    entry.matchMethod ===
                        "nome" ||
                    entry.matchMethod ===
                        "similaridade" ||
                    entry.matchMethod ===
                        "novo"
                      ? entry.matchMethod
                      : undefined,
                })
              )
              .filter(
                (entry) =>
                  Boolean(
                    entry.tinyId
                  )
              )
          : [];

      if (
        entries.length ===
        0
      ) {
        return NextResponse.json(
          {
            success:
              false,

            error:
              "Nenhuma associação de produto foi enviada para a reconciliação completa.",
          },

          {
            status:
              400,
          }
        );
      }

      return NextResponse.json(
        await fullBatch(
          entries
        )
      );
    }

    // =========================================================
    // MODO INVÁLIDO
    // =========================================================
    return NextResponse.json(
      {
        success:
          false,

        error:
          `Modo de sincronização inválido: ${mode}`,
      },

      {
        status:
          400,
      }
    );
  } catch (
    error
  ) {
    console.error(
      "=== ERRO NA SINCRONIZAÇÃO OLIST/TINY V3 ===",
      error
    );

    if (
      error instanceof
      OlistOAuthError
    ) {
      return NextResponse.json(
        {
          success:
            false,

          error:
            error.message,

          code:
            error.code,
        },

        {
          status:
            error.code ===
            "NOT_CONNECTED"
              ? 401
              : 500,
        }
      );
    }

    return NextResponse.json(
      {
        success:
          false,

        error:
          error instanceof Error
            ? error.message
            : "Erro interno na sincronização.",
      },

      {
        status:
          500,
      }
    );
