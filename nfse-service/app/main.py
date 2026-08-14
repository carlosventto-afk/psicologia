from fastapi import FastAPI

app = FastAPI(title="PsiAgente NFS-e Service")


@app.get("/health")
async def health():
    return {"status": "ok"}
