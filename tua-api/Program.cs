var builder = WebApplication.CreateBuilder(args);

// Railway PORT env değişkenine göre dinleme adresi ayarla
var port = Environment.GetEnvironmentVariable("PORT") ?? "8080";
builder.WebHost.UseUrls($"http://+:{port}");

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c => {
    c.SwaggerDoc("v1", new() { Title = "TUA Route API", Version = "v1" });
});

// CORS — localhost (dev) + Railway/Vercel (prod) destekli
var allowedOrigins = new List<string>
{
    "http://localhost:3000",
    "https://localhost:3000"
};

// Prod ortamında ALLOWED_ORIGINS env değişkeninden ekstra originler okunur
var extraOrigins = Environment.GetEnvironmentVariable("ALLOWED_ORIGINS");
if (!string.IsNullOrWhiteSpace(extraOrigins))
{
    allowedOrigins.AddRange(extraOrigins.Split(',', StringSplitOptions.RemoveEmptyEntries));
}

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(allowedOrigins.ToArray())
     .AllowAnyHeader()
     .AllowAnyMethod()
));

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI();
app.UseCors();
app.MapControllers();

app.Run();
