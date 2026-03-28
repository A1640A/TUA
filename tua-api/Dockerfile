# ── Build Stage ──────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Projeyi kopyala ve restore et
COPY tua-api.csproj ./
RUN dotnet restore

# Kaynak kodun tamamını kopyala
COPY . .

# Release olarak yayınla
RUN dotnet publish tua-api.csproj -c Release -o /app/publish --no-restore

# ── Runtime Stage ─────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

COPY --from=build /app/publish .

# Railway PORT env değişkenini kullanır
ENV ASPNETCORE_URLS=http://+:${PORT:-8080}

EXPOSE 8080

ENTRYPOINT ["dotnet", "tua-api.dll"]
